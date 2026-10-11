from __future__ import annotations

import sqlite3
import tempfile
import unittest
import asyncio
import io
import json
import os
import urllib.parse
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request
from starlette.responses import Response

from fastapi import HTTPException

from backend import main
from backend.database import postgres_schema, translate_query
from backend.media_storage import MediaStorage
from backend.rate_limit import FixedWindowRateLimiter, bucket_for, policy_for


class RateLimiterTest(unittest.TestCase):
    def test_fixed_window_enforces_limit_and_recovers_after_window(self):
        limiter=FixedWindowRateLimiter()
        self.assertEqual(limiter.consume("client:auth",2,60,now=100),(True,0,1))
        self.assertEqual(limiter.consume("client:auth",2,60,now=110),(True,0,0))
        self.assertEqual(limiter.consume("client:auth",2,60,now=120),(False,40,0))
        self.assertEqual(limiter.consume("client:auth",2,60,now=160),(True,0,1))

    def test_route_policies_protect_auth_uploads_and_public_reads(self):
        self.assertEqual(policy_for("/api/auth/login","POST"),(10,60))
        self.assertEqual(bucket_for("/api/auth/login","POST"),"auth")
        self.assertEqual(policy_for("/api/settings/photo","POST"),(20,3600))
        self.assertEqual(bucket_for("/api/settings/photo","POST"),"uploads")
        self.assertEqual(policy_for("/api/public/orgs","GET"),(120,60))
        self.assertEqual(policy_for("/api/health","GET"),(0,0))

    def test_limiter_caps_memory_for_many_distinct_clients(self):
        limiter=FixedWindowRateLimiter(max_keys=1)
        self.assertTrue(limiter.consume("first:reads",1,60,now=100)[0])
        self.assertEqual(limiter.consume("second:reads",1,60,now=101),(False,60,0))
        self.assertTrue(limiter.consume("second:reads",1,60,now=160)[0])

    def test_short_windows_do_not_evict_active_longer_windows(self):
        limiter=FixedWindowRateLimiter(max_keys=2)
        self.assertTrue(limiter.consume("upload",1,3600,now=100)[0])
        self.assertTrue(limiter.consume("read",1,60,now=100)[0])
        self.assertTrue(limiter.consume("new-client",1,60,now=161)[0])
        self.assertFalse(limiter.consume("upload",1,3600,now=161)[0])

    def test_auth_limit_returns_retry_headers_when_exceeded(self):
        original=main.RATE_LIMITER
        main.RATE_LIMITER=FixedWindowRateLimiter()
        scope={
            "type":"http","method":"POST","path":"/api/auth/login","raw_path":b"/api/auth/login",
            "query_string":b"","headers":[],"client":("203.0.113.10",1234),"server":("testserver",80),
            "scheme":"http","http_version":"1.1","root_path":"",
        }

        async def call_next(_:Request)->Response:
            return Response("ok")

        try:
            responses=[asyncio.run(main.rate_limit_requests(Request(scope),call_next)) for _ in range(11)]
        finally:
            main.RATE_LIMITER=original
        self.assertEqual([response.status_code for response in responses[:10]],[200]*10)
        self.assertEqual(responses[10].status_code,429)
        self.assertGreater(int(responses[10].headers["Retry-After"]),0)
        self.assertEqual(responses[10].headers["X-RateLimit-Remaining"],"0")


class MediaStorageTest(unittest.TestCase):
    def test_remote_media_can_be_restored_after_local_file_is_removed(self):
        objects={}

        class FakeS3:
            def upload_file(self,filename,bucket,key):
                objects[(bucket,key)]=Path(filename).read_bytes()

            def download_file(self,bucket,key,filename):
                Path(filename).write_bytes(objects[(bucket,key)])

            def delete_object(self,*,Bucket,Key):
                objects.pop((Bucket,Key),None)

        with tempfile.TemporaryDirectory() as directory:
            media_dir=Path(directory)/"profile-photos"
            media_dir.mkdir()
            local_path=media_dir/"profile-1.png"
            local_path.write_bytes(b"image-data")
            storage=MediaStorage("voxera-media",FakeS3())
            storage.save(local_path,"profile-photos")
            local_path.unlink()

            restored=storage.resolve(media_dir,"profile-1.png","profile-photos")
            self.assertEqual(restored.read_bytes(),b"image-data")
            with self.assertRaises(ValueError):
                storage.resolve(media_dir,"..\\outside.png","profile-photos")
            storage.delete(media_dir,"profile-1.png","profile-photos")
            self.assertFalse(restored.exists())
            self.assertEqual(objects,{})

    def test_partial_remote_storage_configuration_is_rejected(self):
        with patch.dict(os.environ,{"VOXERA_S3_ENDPOINT_URL":"https://example.r2.cloudflarestorage.com"},clear=True):
            with self.assertRaisesRegex(RuntimeError,"Configure all VOXERA_S3"):
                MediaStorage.from_environment()

    def test_remote_recordings_support_byte_ranges_without_a_local_copy(self):
        content=b"0123456789"

        class Body(io.BytesIO):
            def iter_chunks(self,chunk_size):
                while chunk:=self.read(chunk_size):
                    yield chunk

        class FakeS3:
            def head_object(self,*,Bucket,Key):
                return {"ContentLength":len(content)}

            def get_object(self,*,Bucket,Key,**kwargs):
                start,end=0,len(content)-1
                if "Range" in kwargs:
                    start_text,end_text=kwargs["Range"].removeprefix("bytes=").split("-")
                    start=int(start_text);end=int(end_text)
                return {"Body":Body(content[start:end+1]),"ContentLength":end-start+1}

        with patch.object(main,"MEDIA_STORAGE",MediaStorage("voxera-media",FakeS3())):
            request=Request({"type":"http","method":"GET","headers":[(b"range",b"bytes=2-5")],"path":"/"})
            response=main.media_download_response(request,"recording.mp4","uploads","video/mp4")
            async def read_body():
                return b"".join([chunk async for chunk in response.body_iterator])

            self.assertEqual(response.status_code,206)
            self.assertEqual(response.headers["content-range"],"bytes 2-5/10")
            self.assertEqual(asyncio.run(read_body()),b"2345")


class PostgresCompatibilityTest(unittest.TestCase):
    def test_translates_sqlite_placeholders_and_insert_behaviors(self):
        query, returns_id=translate_query(
            "INSERT OR IGNORE INTO users(name,username) VALUES(?,?)"
        )
        self.assertTrue(returns_id)
        self.assertEqual(
            query,
            "INSERT INTO users(name,username) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING id",
        )
        query, returns_id=translate_query("INSERT OR REPLACE INTO demo_clock(id,offset_days) VALUES(1,0)")
        self.assertTrue(returns_id)
        self.assertEqual(
            query,
            "INSERT INTO demo_clock(id,offset_days) VALUES(1,0) ON CONFLICT (id) DO UPDATE SET offset_days=EXCLUDED.offset_days RETURNING id",
        )
        query, returns_id=translate_query("SELECT '?' literal, value FROM settings WHERE id=?")
        self.assertFalse(returns_id)
        self.assertEqual(query,"SELECT '?' literal, value FROM settings WHERE id=%s")
        query, returns_id=translate_query("SELECT 1 WHERE CAST(? AS INTEGER) IS NULL")
        self.assertFalse(returns_id)
        self.assertEqual(query,"SELECT 1 WHERE CAST(%s AS INTEGER) IS NULL")

    def test_postgres_schema_generates_integer_primary_keys(self):
        schema=postgres_schema("CREATE TABLE example(id INTEGER PRIMARY KEY, owner INTEGER REFERENCES users(id));")
        self.assertIn("id SERIAL PRIMARY KEY",schema)


class AuthenticationEnhancementsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir=tempfile.TemporaryDirectory()
        self.original_db=main.DB_PATH
        main.DB_PATH=Path(self.temp_dir.name)/"auth.db"
        main.init_db()

    def tearDown(self):
        main.DB_PATH=self.original_db
        self.temp_dir.cleanup()

    def test_email_verification_blocks_password_login_until_one_time_token_is_used(self):
        sent=[]
        with patch.object(main,"EMAIL_VERIFICATION_ENABLED",True),patch.object(main,"send_auth_email",side_effect=lambda email,subject,body:sent.append(body)):
            result=main.register(main.RegisterInput(name="New Member",username="new@example.test",password="long-password",consent_data=True))
            self.assertTrue(result["verification_required"])
            with self.assertRaises(HTTPException) as raised:
                main.login(main.LoginInput(username="new@example.test",password="long-password"))
            self.assertEqual(raised.exception.status_code,403)
            token=urllib.parse.parse_qs(urllib.parse.urlsplit(sent[0].splitlines()[2]).fragment)["verify_email"][0]
            self.assertTrue(main.verify_email(main.EmailTokenInput(token=token))["verified"])
            self.assertIn("token",main.login(main.LoginInput(username="new@example.test",password="long-password")))
            with self.assertRaises(HTTPException):
                main.verify_email(main.EmailTokenInput(token=token))

    def test_email_verification_rejects_malformed_registration_addresses(self):
        with self.assertRaises(ValueError):
            main.RegisterInput(name="Invalid Email",username="not-an-email",password="long-password",consent_data=True)

    def test_password_reset_changes_password_and_token_is_single_use(self):
        main.register(main.RegisterInput(name="Reset Member",username="reset@example.test",password="old-password",consent_data=True))
        sent=[]
        with patch.object(main,"SMTP_HOST","smtp.example.test"),patch.object(main,"EMAIL_FROM","no-reply@example.test"),patch.object(main,"PUBLIC_URL","https://voxera.example.test"),patch.object(main,"send_auth_email",side_effect=lambda email,subject,body:sent.append(body)):
            main.request_password_reset(main.PasswordResetRequestInput(email="reset@example.test"))
            token=urllib.parse.parse_qs(urllib.parse.urlsplit(sent[0].splitlines()[2]).fragment)["password_reset"][0]
            result=main.complete_password_reset(main.PasswordResetInput(token=token,password="new-password"))
            self.assertIn("changed",result["message"])
            self.assertIn("token",main.login(main.LoginInput(username="reset@example.test",password="new-password")))
            with self.assertRaises(HTTPException):
                main.complete_password_reset(main.PasswordResetInput(token=token,password="another-password"))

    def test_google_signup_creates_a_verified_participant_and_rejects_reused_code(self):
        code=main.issue_google_completion(
            {"sub":"google-sub-1","email":"google@example.test","name":"Google Member"},
            {"role":"participant","intent":"signup"},
        )
        result=main.google_auth_complete(main.GoogleCompleteInput(code=code,consent_data=True))
        self.assertEqual(result["user"]["username"],"google@example.test")
        with main.connect() as db:
            user=db.execute("SELECT email_verified,google_sub FROM users WHERE username=?",(result["user"]["username"],)).fetchone()
            profile=db.execute("SELECT consent_data FROM profiles WHERE user_id=?",(result["user"]["id"],)).fetchone()
        self.assertEqual(user["email_verified"],1)
        self.assertEqual(user["google_sub"],"google-sub-1")
        self.assertEqual(profile["consent_data"],1)
        with self.assertRaises(HTTPException):
            main.google_auth_complete(main.GoogleCompleteInput(code=code,consent_data=True))

    def test_google_signup_can_create_an_organisation_workspace(self):
        code=main.issue_google_completion(
            {"sub":"google-org-sub","email":"org-google@example.test","name":"Org Admin"},
            {"role":"organiser","intent":"signup"},
        )
        result=main.google_auth_complete(main.GoogleCompleteInput(code=code,name="Org Admin",organisation_name="Google Org"))
        self.assertEqual(result["user"]["role"],"organiser")
        with main.connect() as db:
            organisation=db.execute("SELECT name FROM organisations WHERE id=?",(result["user"]["organisation_id"],)).fetchone()
            user=db.execute("SELECT email_verified FROM users WHERE id=?",(result["user"]["id"],)).fetchone()
        self.assertEqual(organisation["name"],"Google Org")
        self.assertEqual(user["email_verified"],1)

    def test_google_oauth_state_is_browser_bound_and_completion_code_is_single_use(self):
        with patch.object(main,"GOOGLE_CLIENT_ID","google-client"),patch.object(main,"GOOGLE_CLIENT_SECRET","google-secret"),patch.object(main,"API_PUBLIC_URL","https://api.example.test"),patch.object(main,"PUBLIC_URL","https://voxera.example.test"),patch.object(main,"google_identity",return_value={"sub":"oauth-sub","email":"oauth@example.test","name":"OAuth Member"}):
            start=main.google_auth_start(role="participant",intent="signup")
            location=urllib.parse.urlsplit(start.headers["location"])
            state=urllib.parse.parse_qs(location.query)["state"][0]
            cookie=start.headers["set-cookie"].split(";",1)[0]
            query=urllib.parse.urlencode({"state":state,"code":"provider-code"})
            request=Request({"type":"http","method":"GET","path":"/api/auth/google/callback","query_string":query.encode(),"headers":[(b"cookie",cookie.encode())]})
            callback=main.google_auth_callback(request)
        completion_code=urllib.parse.parse_qs(urllib.parse.urlsplit(callback.headers["location"]).fragment)["google_code"][0]
        result=main.google_auth_complete(main.GoogleCompleteInput(code=completion_code,consent_data=True))
        self.assertEqual(result["user"]["username"],"oauth@example.test")
        self.assertIn("max-age=0",callback.headers["set-cookie"].casefold())


class CoreRulesTest(unittest.TestCase):
    def test_activity_type_defaults_and_validates_expanded_values(self):
        self.assertEqual(main.ProgrammeInput(title="Default programme",start_date="2026-11-01",end_date="2026-11-30").activity_type,"programme")
        self.assertEqual(main.ProgrammeInput(title="Community event",start_date="2026-11-01",end_date="2026-11-30",activity_type="event").activity_type,"event")
        self.assertEqual(main.SetupInput(organisation_name="Community Hub",organisation_type="Community group",name="Organiser",username="activity-type@example.test",password="long-enough-password").organisation_type,"Community group")

    def test_public_activities_are_filtered_and_exclude_participant_data(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"public-activities.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Community Hub",organisation_type="Community group",name="Organiser",username="public-activity@example.test",password="long-enough-password"))
                with main.connect() as db:
                    organiser=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    slug=db.execute("SELECT slug FROM organisations WHERE id=?",(organisation["user"]["organisation_id"],)).fetchone()["slug"]
                self.assertFalse(main.settings(organiser)["public_page_available"])
                activity=main.create_programme(main.ProgrammeInput(title="Community event",activity_type="event",start_date="2026-11-01",end_date="2026-11-30",status="open"),organiser)
                profile=main.update_settings(main.OrganisationSettingsInput(name="Community Hub",type="Community group",profile_sections=[{"title":"Our mission","body":"We help neighbours learn together."}]),organiser)
                self.assertEqual(profile["profile_sections"],[{"title":"Our mission","body":"We help neighbours learn together."}])
                self.assertTrue(main.settings(organiser)["public_page_available"])
                with self.assertRaises(HTTPException) as raised:
                    main.update_settings(main.OrganisationSettingsInput(name="Community Hub",type="Community group",profile_sections=[{"title":"  ","body":"Text"}]),organiser)
                self.assertEqual(raised.exception.status_code,422)
                with self.assertRaises(ValueError):
                    main.OrganisationSettingsInput(name="Community Hub",type="Community group",profile_sections=[{"title":f"Section {index}","body":"Text"} for index in range(9)])
                public_rows=main.public_activities("", "event", "", 50, 0)
                self.assertEqual([row["id"] for row in public_rows],[activity["id"]])
                self.assertEqual(public_rows[0]["activity_type"],"event")
                self.assertNotIn("participant_id",public_rows[0])
                public_page=main.public_organisation_page(slug)
                self.assertEqual(public_page["organisation"]["name"],"Community Hub")
                self.assertEqual(public_page["organisation"]["profile_sections"],profile["profile_sections"])
                self.assertEqual([row["id"] for row in public_page["activities"]],[activity["id"]])
                self.assertNotIn("participant_id",public_page["activities"][0])
                legacy_update=main.update_settings(main.OrganisationSettingsInput(name="Community Hub",type="Community group"),organiser)
                self.assertEqual(legacy_update["profile_sections"],profile["profile_sections"])
                with self.assertRaises(HTTPException) as raised:main.public_activities("", "unknown", "", 50, 0)
                self.assertEqual(raised.exception.status_code,422)
            finally:
                main.DB_PATH=original

    def test_one_off_physical_activities_and_enrolment_count_privacy(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"activity-privacy.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Running Together",organisation_type="Community group",name="Organiser",username="running@example.test",password="StrongPassword123"))
                with main.connect() as db:
                    organiser=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    slug=db.execute("SELECT slug FROM organisations WHERE id=?",(organisation["user"]["organisation_id"],)).fetchone()["slug"]
                event=main.create_programme(main.ProgrammeInput(title="Saturday community jog",activity_type="event",format="Physical",location="Lagos waterfront",start_date="2027-01-01",end_date="2027-01-01",status="open"),organiser)
                self.assertEqual(main.sessions(event["id"],organiser),[])
                live_session=main.SessionInput(title="Online class",kind="live_online",scheduled_start="2027-01-01T10:00:00+00:00",scheduled_end="2027-01-01T11:00:00+00:00")
                with self.assertRaises(HTTPException) as raised:
                    main.create_programme(main.ProgrammeInput(title="Physical activity with online class",format="Physical",start_date="2027-01-01",end_date="2027-01-01",status="open",sessions=[live_session]),organiser)
                self.assertEqual(raised.exception.status_code,422)
                participant_rows=[]
                for index in range(5):
                    result=main.register(main.RegisterInput(name=f"Participant {index}",username=f"insight-{index}@example.test",password="StrongPassword123",consent_data=True))
                    with main.connect() as db:
                        participant=db.execute("SELECT * FROM users WHERE id=?",(result["user"]["id"],)).fetchone()
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(event["id"],participant["id"],"enrolled",main.now()))
                    main.update_participant_insights(main.ParticipantInsightsInput(consent=True,age_band="25_34",interests=["Employment"]),participant)
                    participant_rows.append(participant)
                self.assertIsNone(main.public_activities("", "event", "", 50, 0)[0]["enrolled_count"])
                public_page=main.public_organisation_page(slug)
                self.assertIsNone(public_page["activities"][0]["enrolled_count"])
                with main.connect() as db:slug_row=db.execute("SELECT * FROM users WHERE id=?",(participant_rows[0]["id"],)).fetchone()
                self.assertIsNone(main.public_organisation_programmes(organisation["user"]["organisation_id"],slug_row)["programmes"][0]["enrolled_count"])
                report=main.reports(organiser)
                self.assertEqual(report["participant_insights"][str(event["id"])]["age_groups"],[{"age_band":"25_34","count":5}])
                self.assertEqual(report["participant_insights"][str(event["id"])]["interests"],[{"interest":"employment","count":5}])
                main.update_participant_insights(main.ParticipantInsightsInput(consent=False),participant_rows[0])
                report=main.reports(organiser)
                self.assertEqual(report["participant_insights"][str(event["id"])]["age_groups"],[])
                settings=main.update_settings(main.OrganisationSettingsInput(name="Running Together",type="Community group",show_enrolment_counts=True),organiser)
                self.assertTrue(settings["show_enrolment_counts"])
                self.assertTrue(main.update_settings(main.OrganisationSettingsInput(name="Running Together",type="Community group"),organiser)["show_enrolment_counts"])
                self.assertEqual(main.public_activities("", "event", "", 50, 0)[0]["enrolled_count"],5)
                self.assertEqual(main.public_organisation_page(slug)["activities"][0]["enrolled_count"],5)
                self.assertEqual(main.public_organisation_programmes(organisation["user"]["organisation_id"],slug_row)["programmes"][0]["enrolled_count"],5)
                self.assertEqual(main.list_programmes(slug_row)[0]["enrolled_count"],5)
            finally:
                main.DB_PATH=original

    def test_activity_type_migration_preserves_existing_programmes(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"old-programmes.db"
            try:
                db=sqlite3.connect(main.DB_PATH)
                try:
                    db.execute("CREATE TABLE organisations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL)")
                    db.execute("INSERT INTO organisations VALUES(1,'Community Hub','Community group')")
                    db.execute("INSERT INTO organisations VALUES(2,'Community Hub','NGO')")
                    db.execute("CREATE TABLE programmes(id INTEGER PRIMARY KEY,organisation_id INTEGER,title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,format TEXT NOT NULL,location TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,capacity INTEGER NOT NULL,eligibility TEXT NOT NULL,status TEXT NOT NULL,certificate_threshold INTEGER NOT NULL DEFAULT 70,created_at TEXT NOT NULL)")
                    db.execute("INSERT INTO programmes VALUES(1,NULL,'Legacy programme','','Training','Online','Remote','2026-11-01','2026-11-30',20,'Open','open',70,'2026-10-01')")
                    db.commit()
                finally:
                    db.close()
                main.init_db()
                with main.connect() as db:
                    row=db.execute("SELECT activity_type FROM programmes WHERE id=1").fetchone()
                    organisation=db.execute("SELECT profile_sections FROM organisations WHERE id=1").fetchone()
                    slugs=[item["slug"] for item in db.execute("SELECT slug FROM organisations ORDER BY id")]
                self.assertEqual(row["activity_type"],"programme")
                self.assertEqual(json.loads(organisation["profile_sections"]),[])
                self.assertEqual(slugs,["community-hub","community-hub-2"])
            finally:
                main.DB_PATH=original

    def test_session_description_column_is_added_to_existing_database(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"old-sessions.db"
            try:
                db=sqlite3.connect(main.DB_PATH)
                try:
                    db.execute("CREATE TABLE sessions(id INTEGER PRIMARY KEY,programme_id INTEGER NOT NULL,title TEXT NOT NULL,kind TEXT NOT NULL,scheduled_start TEXT NOT NULL,scheduled_end TEXT NOT NULL,recording_file TEXT,captions_file TEXT,recording_no_expiry INTEGER NOT NULL DEFAULT 0,deadline_days INTEGER NOT NULL DEFAULT 7,quiz_json TEXT NOT NULL DEFAULT '[]',qr_token TEXT NOT NULL)")
                finally:
                    db.close()
                main.init_db()
                with main.connect() as db:
                    columns={row["name"] for row in db.execute("PRAGMA table_info(sessions)")}
                self.assertIn("description",columns)
            finally:
                main.DB_PATH=original

    def _live_attendance_fixture(self):
        main.init_db()
        organiser_account=main.setup(main.SetupInput(organisation_name="Attendance Test Org",organisation_type="NGO",name="Organiser",username="attendance-organiser@example.test",password="test-password"))
        participants=[main.register(main.RegisterInput(name=f"Participant {index}",username=f"attendance-{index}@example.test",password="test-password",consent_data=True)) for index in range(1,4)]
        with main.connect() as db:
            programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organiser_account["user"]["organisation_id"],"Attendance programme","","Training","Online","Remote","2026-10-09","2026-10-09",20,"Open","open",main.now())).lastrowid
            session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(programme_id,"Attendance class","live_online","2026-10-09T10:00:00+00:00","2026-10-09T11:00:00+00:00","attendance-token")).lastrowid
            for participant in participants[:2]:
                db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["user"]["id"],"enrolled",main.now()))
            organiser=db.execute("SELECT * FROM users WHERE id=?",(organiser_account["user"]["id"],)).fetchone()
            enrolled=db.execute("SELECT * FROM users WHERE id=?",(participants[0]["user"]["id"],)).fetchone()
            enrolled_two=db.execute("SELECT * FROM users WHERE id=?",(participants[1]["user"]["id"],)).fetchone()
            outsider=db.execute("SELECT * FROM users WHERE id=?",(participants[2]["user"]["id"],)).fetchone()
        return session_id,organiser,enrolled,enrolled_two,outsider

    def _start_live_attendance(self,session_id,organiser,started_at="2026-10-09T10:00:00+00:00"):
        with patch.object(main,"now",return_value=started_at):
            return main.live_state(session_id,main.LiveInput(active=True),organiser)

    def _end_live_attendance(self,session_id,organiser,ended_at):
        with patch.object(main,"now",return_value=ended_at):
            return main.live_state(session_id,main.LiveInput(active=False),organiser)

    def test_live_attendance_uses_actual_early_and_late_join_intervals(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"live-join-attendance.db"
            try:
                session_id,organiser,early,late,outsider=self._live_attendance_fixture()
                self._start_live_attendance(session_id,organiser)
                with main.connect() as db:
                    main.open_live_presence_interval(db,session_id,early["id"],"early-device",main.live_timestamp("2026-10-09T10:00:00+00:00"))
                    main.close_live_presence_interval(db,session_id,early["id"],"early-device",main.live_timestamp("2026-10-09T11:00:00+00:00"))
                    main.open_live_presence_interval(db,session_id,late["id"],"late-device",main.live_timestamp("2026-10-09T10:10:00+00:00"))
                    main.close_live_presence_interval(db,session_id,late["id"],"late-device",main.live_timestamp("2026-10-09T11:00:00+00:00"))
                with self.assertRaises(HTTPException) as raised:
                    main.live_heartbeat(session_id,main.HeartbeatInput(),outsider)
                self.assertEqual(raised.exception.status_code,403)
                result=self._end_live_attendance(session_id,organiser,"2026-10-09T11:00:00+00:00")
                self.assertEqual(result["duration_seconds"],3600)
                with main.connect() as db:
                    records={row["participant_id"]:row["percent"] for row in db.execute("SELECT participant_id,percent FROM attendance WHERE session_id=? AND valid=1",(session_id,))}
                self.assertEqual(records[early["id"]],100)
                self.assertAlmostEqual(records[late["id"]],83.3333,places=3)
            finally:
                main.DB_PATH=original

    def test_live_attendance_does_not_credit_time_after_early_leave(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"live-early-leave.db"
            try:
                session_id,organiser,participant,_,_=self._live_attendance_fixture()
                self._start_live_attendance(session_id,organiser)
                with main.connect() as db:
                    main.open_live_presence_interval(db,session_id,participant["id"],"participant-device",main.live_timestamp("2026-10-09T10:00:00+00:00"))
                    main.close_live_presence_interval(db,session_id,participant["id"],"participant-device",main.live_timestamp("2026-10-09T10:30:00+00:00"))
                self._end_live_attendance(session_id,organiser,"2026-10-09T11:00:00+00:00")
                with main.connect() as db:
                    presence=db.execute("SELECT seconds FROM live_presence WHERE session_id=? AND participant_id=?",(session_id,participant["id"])).fetchone()
                    attendance=db.execute("SELECT id FROM attendance WHERE session_id=? AND participant_id=? AND valid=1",(session_id,participant["id"])).fetchone()
                self.assertEqual(presence["seconds"],1800)
                self.assertIsNone(attendance)
            finally:
                main.DB_PATH=original

    def test_live_attendance_unions_overlapping_leave_and_rejoin_intervals(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"live-rejoin-attendance.db"
            try:
                session_id,organiser,participant,_,_=self._live_attendance_fixture()
                self._start_live_attendance(session_id,organiser)
                with main.connect() as db:
                    main.open_live_presence_interval(db,session_id,participant["id"],"first-connection",main.live_timestamp("2026-10-09T10:00:00+00:00"))
                    main.open_live_presence_interval(db,session_id,participant["id"],"first-connection",main.live_timestamp("2026-10-09T10:05:00+00:00"))
                    main.close_live_presence_interval(db,session_id,participant["id"],"first-connection",main.live_timestamp("2026-10-09T10:40:00+00:00"))
                    main.open_live_presence_interval(db,session_id,participant["id"],"rejoined-connection",main.live_timestamp("2026-10-09T10:30:00+00:00"))
                    main.close_live_presence_interval(db,session_id,participant["id"],"rejoined-connection",main.live_timestamp("2026-10-09T11:00:00+00:00"))
                    self.assertEqual(db.execute("SELECT count(*) FROM live_presence_intervals WHERE session_id=? AND participant_id=? AND connection_id='first-connection'",(session_id,participant["id"])).fetchone()[0],1)
                self._end_live_attendance(session_id,organiser,"2026-10-09T11:00:00+00:00")
                with main.connect() as db:
                    presence=db.execute("SELECT seconds FROM live_presence WHERE session_id=? AND participant_id=?",(session_id,participant["id"])).fetchone()
                    attendance=db.execute("SELECT percent FROM attendance WHERE session_id=? AND participant_id=? AND valid=1",(session_id,participant["id"])).fetchone()
                self.assertEqual(presence["seconds"],3600)
                self.assertEqual(attendance["percent"],100)
            finally:
                main.DB_PATH=original

    def test_live_attendance_closes_connected_participants_at_actual_class_end(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"live-class-end-attendance.db"
            try:
                session_id,organiser,participant,_,_=self._live_attendance_fixture()
                self._start_live_attendance(session_id,organiser)
                with main.connect() as db:
                    main.open_live_presence_interval(db,session_id,participant["id"],"still-connected",main.live_timestamp("2026-10-09T10:00:00+00:00"))
                result=self._end_live_attendance(session_id,organiser,"2026-10-09T10:20:00+00:00")
                self.assertEqual(result["duration_seconds"],1200)
                with main.connect() as db:
                    interval=db.execute("SELECT ended_at FROM live_presence_intervals WHERE session_id=? AND participant_id=?",(session_id,participant["id"])).fetchone()
                    record=db.execute("SELECT percent FROM attendance WHERE session_id=? AND participant_id=? AND valid=1",(session_id,participant["id"])).fetchone()
                self.assertEqual(interval["ended_at"],"2026-10-09T10:20:00+00:00")
                self.assertEqual(record["percent"],100)
            finally:
                main.DB_PATH=original

    def test_websocket_reconnect_is_idempotent_and_requires_session_access(self):
        class FakeWebSocket:
            def __init__(self,messages):
                self.messages=list(messages)
                self.sent=[]
            async def accept(self):pass
            async def send_json(self,event):self.sent.append(event)
            async def receive_json(self):
                if self.messages:return self.messages.pop(0)
                raise main.WebSocketDisconnect()

        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"live-websocket-attendance.db"
            try:
                session_id,organiser,participant,_,outsider=self._live_attendance_fixture()
                self._start_live_attendance(session_id,organiser)
                socket=FakeWebSocket([{"type":"join_live","session_id":session_id},{"type":"join_live","session_id":session_id},{"type":"leave_live"}])
                asyncio.run(main.websocket(socket,main.token_for(participant)))
                denied_socket=FakeWebSocket([{"type":"join_live","session_id":session_id},{"type":"offer","description":{}}])
                asyncio.run(main.websocket(denied_socket,main.token_for(outsider)))
                self.assertTrue(any(event["type"]=="error" for event in denied_socket.sent))
                with main.connect() as db:
                    intervals=db.execute("SELECT connection_id,ended_at FROM live_presence_intervals WHERE session_id=? AND participant_id=?",(session_id,participant["id"])).fetchall()
                    outsider_presence=db.execute("SELECT 1 FROM live_presence WHERE session_id=? AND participant_id=?",(session_id,outsider["id"])).fetchone()
                self.assertEqual(len(intervals),1)
                self.assertIsNotNone(intervals[0]["ended_at"])
                self.assertIsNone(outsider_presence)
            finally:
                main.DB_PATH=original

    def test_segments_merge_and_clip_to_duration(self):
        merged,total=main.merge_segments([[0,20],[18,40],[70,90],[-10,2],[95,120]],100)
        self.assertEqual(merged,[[0.0,40.0],[70.0,90.0],[95.0,100.0]])
        self.assertEqual(total,65.0)

    @patch.object(main,"ollama_classify",return_value=None)
    def test_only_safe_categories_auto_resolve(self,_):
        self.assertFalse(main.classify("I was sick")['needs_human'])
        self.assertFalse(main.classify("The bus fare delayed me")['needs_human'])
        self.assertTrue(main.classify("I cannot afford transport")['needs_human'])
        self.assertTrue(main.classify("Please let me talk to a person")['needs_human'])
        self.assertEqual(main.classify("Where is Digital Skills?",use_model=False)["category"],"other")

    @patch.object(main,"ollama_classify",return_value=None)
    def test_safety_keywords_force_critical_human_escalation(self,_):
        result=main.classify("I am in danger and need help")
        self.assertTrue(result['needs_human'])
        self.assertTrue(result['safety_flag'])
        self.assertEqual(result['urgency'],'Critical')

    def test_role_guards_reject_participants_from_staff_actions(self):
        staff_only=main.require("organiser","admin")
        with self.assertRaises(HTTPException) as raised:staff_only({"role":"participant"})
        self.assertEqual(raised.exception.status_code,403)

    def test_organisation_gallery_uploads_public_read_comments_and_tenant_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload=main.DB_PATH,main.UPLOAD_DIR
            main.DB_PATH=Path(directory)/"gallery.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.UPLOAD_DIR.mkdir()
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="Gallery Org",organisation_type="NGO",name="Gallery Organiser",username="gallery@example.test",password="gallery-test-password"))
                second=main.setup(main.SetupInput(organisation_name="Other Gallery",organisation_type="Company",name="Other Organiser",username="other-gallery@example.test",password="gallery-test-password"))
                participant=main.register(main.RegisterInput(name="Amina Participant",username="amina@example.test",password="gallery-test-password",consent_data=True))
                with main.connect() as db:
                    first_admin=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_admin=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                    participant_user=db.execute("SELECT * FROM users WHERE id=?",(participant["user"]["id"],)).fetchone()
                    slug=db.execute("SELECT slug FROM organisations WHERE id=?",(first["user"]["organisation_id"],)).fetchone()["slug"]

                created=main.create_gallery_album(main.GalleryAlbumInput(title="Community day"),first_admin)
                album=created["album"]
                self.assertEqual(album["title"],"Community day")
                self.assertIsNone(album["cover_url"])
                image=b"\x89PNG\r\n\x1a\n"+b"gallery image bytes"
                uploaded=UploadFile(filename="community.png",file=io.BytesIO(image),headers=Headers({"content-type":"image/png"}))
                media_result=asyncio.run(main.upload_gallery_media(album["id"],uploaded,first_admin))
                item=media_result["media"]
                self.assertEqual(item["kind"],"image")
                self.assertEqual(item["media_type"],"image/png")
                self.assertEqual(media_result["album"]["cover_url"],item["url"])
                self.assertEqual(media_result["album"]["media"][0]["id"],item["id"])

                public=main.public_gallery(slug)
                self.assertEqual(public["organisation"]["slug"],slug)
                public_album=public["albums"][0]
                self.assertEqual(public_album["cover_url"],item["url"])
                self.assertEqual(public_album["comments"],[])
                response=main.public_gallery_media(slug,item["id"])
                self.assertEqual(Path(response.path).read_bytes(),image)

                with self.assertRaises(HTTPException) as raised:
                    main.update_gallery_album(album["id"],main.GalleryAlbumInput(title="Cross tenant edit"),second_admin)
                self.assertEqual(raised.exception.status_code,404)
                with self.assertRaises(HTTPException) as raised:
                    main.delete_gallery_album(album["id"],second_admin)
                self.assertEqual(raised.exception.status_code,404)

                comment=main.create_gallery_comment(slug,album["id"],main.GalleryCommentInput(body="Wonderful event"),participant_user)["comment"]
                self.assertEqual(comment["author_name"],"Amina")
                self.assertNotIn("username",comment)
                self.assertEqual(main.list_gallery_comments(slug,album["id"])["comments"],[comment])
                public=main.public_gallery(slug)["albums"][0]
                self.assertEqual(public["comment_count"],1)
                self.assertEqual(public["comments"][0]["author_name"],"Amina")

                invalid=UploadFile(filename="not-an-image.png",file=io.BytesIO(b"invalid"),headers=Headers({"content-type":"image/png"}))
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(main.upload_gallery_media(album["id"],invalid,first_admin))
                self.assertEqual(raised.exception.status_code,415)
                mismatch=UploadFile(filename="clip.mp4",file=io.BytesIO(b"video"),headers=Headers({"content-type":"image/png"}))
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(main.upload_gallery_media(album["id"],mismatch,first_admin))
                self.assertEqual(raised.exception.status_code,415)
                with patch.object(main,"GALLERY_IMAGE_MAX_BYTES",len(image)):
                    too_large=UploadFile(filename="large.png",file=io.BytesIO(image+b"x"),headers=Headers({"content-type":"image/png"}))
                    with self.assertRaises(HTTPException) as raised:
                        asyncio.run(main.upload_gallery_media(album["id"],too_large,first_admin))
                self.assertEqual(raised.exception.status_code,413)

                self.assertTrue(main.update_gallery_album(album["id"],main.GalleryAlbumInput(title="Updated event"),first_admin)["album"]["title"]=="Updated event")
                path=main.UPLOAD_DIR/item["url"].rsplit("/",1)[-1]
                self.assertTrue(main.delete_gallery_album(album["id"],first_admin)["deleted"])
                self.assertFalse(path.exists())
                with self.assertRaises(HTTPException) as raised:
                    main.public_gallery_media(slug,item["id"])
                self.assertEqual(raised.exception.status_code,404)
                with self.assertRaises(HTTPException) as raised:
                    main.require("participant")(first_admin)
                self.assertEqual(raised.exception.status_code,403)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload

    def test_reports_exclude_applicants_from_enrolment_completion_and_other_tenants(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"reports.db"
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="Password123!"))
                second=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="Company",name="Second Admin",username="second@example.test",password="Password123!"))
                people=[main.register(main.RegisterInput(name=f"Participant {index}",username=f"participant{index}@example.test",password="Password123!",consent_data=True)) for index in range(1,5)]
                with main.connect() as db:
                    first_programme=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(first["user"]["organisation_id"],"First programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    second_programme=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(second["user"]["organisation_id"],"Other programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    session_ids=[db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(first_programme,f"Session {index}","live_online","2026-10-01T10:00:00+00:00","2026-10-01T11:00:00+00:00",f"token{index}")).lastrowid for index in (1,2)]
                    statuses=[("enrolled",first_programme,people[0]),("completed",first_programme,people[1]),("applied",first_programme,people[2]),("waitlisted",first_programme,people[3]),("enrolled",second_programme,people[3])]
                    for status,programme_id,participant in statuses:
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["user"]["id"],status,main.now()))
                    db.execute("INSERT INTO attendance(session_id,participant_id,mode,percent,marked_at,valid) VALUES(?,?,?, ?,?,1)",(session_ids[0],people[0]["user"]["id"],"live",40,main.now()))
                    db.execute("INSERT INTO attendance(session_id,participant_id,mode,percent,marked_at,valid) VALUES(?,?,?, ?,?,1)",(session_ids[1],people[0]["user"]["id"],"live",80,main.now()))
                    db.execute("INSERT INTO attendance(session_id,participant_id,mode,percent,marked_at,valid) VALUES(?,?,?, ?,?,1)",(session_ids[0],people[1]["user"]["id"],"recording",100,main.now()))
                    db.execute("INSERT INTO outcome_checkins(participant_id,programme_id,milestone,prompt,response,created_at,responded_at) VALUES(?,?,?,?,?,?,?)",(people[0]["user"]["id"],first_programme,"1 month","What changed?","I found work.",main.now(),main.now()))
                    db.execute("INSERT INTO outcome_checkins(participant_id,programme_id,milestone,prompt,response,created_at,responded_at) VALUES(?,?,?,?,?,?,?)",(people[3]["user"]["id"],second_programme,"1 month","What changed?","A different organisation response.",main.now(),main.now()))
                    db.execute("INSERT INTO followup_cases(participant_id,programme_id,trigger_type,status,category,urgency,original_text,translation_en,summary,suggested_reply,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(people[0]["user"]["id"],first_programme,"absence_reply","open","transport","Normal","Needs help","Needs help","Needs support","We can help.",main.now()))
                    db.execute("INSERT INTO followup_cases(participant_id,programme_id,trigger_type,status,category,urgency,original_text,translation_en,summary,suggested_reply,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(people[3]["user"]["id"],second_programme,"absence_reply","open","other","Normal","Other tenant","Other tenant","Other tenant","Reply.",main.now()))
                    first_admin=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_admin=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                result=main.reports(first_admin)
                self.assertEqual(result["cases_by_category"],[{"programme_id":first_programme,"programme_title":"First programme","status":"open","category":"transport","count":1}])
                self.assertEqual(result["metrics"]["participant_count"],2)
                self.assertEqual(result["metrics"]["applicants"],1)
                self.assertEqual(result["metrics"]["waitlisted"],1)
                self.assertEqual(result["metrics"]["completion_rate"],50.0)
                self.assertEqual(result["metrics"]["outcome_checkins"],1)
                self.assertEqual(result["metrics"]["outcome_responses"],1)
                self.assertEqual(result["metrics"]["followup_response_rate"],100.0)
                self.assertEqual([item["response"] for item in result["outcome_responses"]],["I found work."])
                programme=next(item for item in result["programmes"] if item["id"]==first_programme)
                self.assertEqual(programme["enrolments"],2)
                self.assertEqual(programme["applicants"],1)
                self.assertEqual(programme["waitlisted"],1)
                self.assertEqual(programme["completed"],1)
                self.assertEqual(programme["attendance"],73.3)
                self.assertEqual(len(main.reports(second_admin)["programmes"]),1)
                csv_response=main.report_csv(first_admin)
                async def collect_csv():
                    return "".join([part async for part in csv_response.body_iterator])
                csv_text=asyncio.run(collect_csv())
                self.assertIn("Participant 1",csv_text)
                self.assertNotIn("Participant 4",csv_text)
                filtered_csv=main.report_csv(first_admin,programme_id=second_programme)
                async def collect_filtered_csv():
                    return "".join([part async for part in filtered_csv.body_iterator])
                self.assertEqual(asyncio.run(collect_filtered_csv()),"Name,Username,Language,Programme,Average attendance,Attendance records\n")
                with self.assertRaises(HTTPException) as raised:main.report_csv(first_admin,programme_id=0)
                self.assertEqual(raised.exception.status_code,422)
            finally:
                main.DB_PATH=original

    def test_account_and_organisation_profiles_save_photos_and_theme(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload,original_profiles=main.DB_PATH,main.UPLOAD_DIR,main.PROFILE_IMAGE_DIR
            main.DB_PATH=Path(directory)/"profiles.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.UPLOAD_DIR.mkdir()
            main.PROFILE_IMAGE_DIR=Path(directory)/"profile-photos"
            main.PROFILE_IMAGE_DIR.mkdir()
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Original Org",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="Password123!"))
                participant=main.register(main.RegisterInput(name="Participant",username="participant@example.test",password="Password123!",consent_data=True))
                with main.connect() as db:
                    organiser_user=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    participant_user=db.execute("SELECT u.*,EXISTS(SELECT 1 FROM platform_owners p WHERE p.user_id=u.id) is_platform_owner,0 organisation_archived FROM users u WHERE id=?",(participant["user"]["id"],)).fetchone()
                updated=main.update_account_profile(main.AccountProfileInput(name="Updated Participant",area="Kano",theme="dark"),participant_user)
                self.assertEqual(updated["name"],"Updated Participant")
                self.assertEqual(updated["area"],"Kano")
                self.assertEqual(updated["theme"],"dark")
                with self.assertRaises(HTTPException) as raised:main.update_account_profile(main.AccountProfileInput(theme=None),participant_user)
                self.assertEqual(raised.exception.status_code,422)
                changed=main.update_settings(main.OrganisationSettingsInput(name="Updated Org",type="Company"),organiser_user)
                self.assertEqual(changed["name"],"Updated Org")
                png=b"\x89PNG\r\n\x1a\n"+b"test"
                photo_upload=UploadFile(filename="profile.png",file=io.BytesIO(png),headers=Headers({"content-type":"image/png"}))
                self.assertTrue(asyncio.run(main.upload_account_photo(photo_upload,participant_user))["image_available"])
                account_photo=main.account_photo(participant_user)
                self.assertEqual(Path(account_photo.path).read_bytes(),png)
                photo_path=Path(account_photo.path)
                removed=main.delete_account_photo(participant_user)
                self.assertFalse(removed["image_available"])
                self.assertFalse(photo_path.exists())
                with self.assertRaises(HTTPException) as raised:main.account_photo(participant_user)
                self.assertEqual(raised.exception.status_code,404)
                org_image=png+(b"o"*(2*1024*1024))
                org_upload=UploadFile(filename="org.png",file=io.BytesIO(org_image),headers=Headers({"content-type":"image/png"}))
                self.assertTrue(asyncio.run(main.upload_organisation_photo(org_upload,organiser_user))["image_available"])
                organisation_photo_path=Path(main.organisation_photo(organiser_user).path)
                self.assertEqual(organisation_photo_path.stat().st_size,len(org_image))
                self.assertTrue(main.delete_organisation_photo(organiser_user)["removed"])
                self.assertFalse(organisation_photo_path.exists())
                self.assertFalse(main.delete_organisation_photo(organiser_user)["image_available"])
                with self.assertRaises(HTTPException) as raised:main.organisation_photo(organiser_user)
                self.assertEqual(raised.exception.status_code,404)
                invalid=UploadFile(filename="not-an-image.png",file=io.BytesIO(b"not an image"),headers=Headers({"content-type":"image/png"}))
                with self.assertRaises(HTTPException) as raised:asyncio.run(main.upload_account_photo(invalid,participant_user))
                self.assertEqual(raised.exception.status_code,415)
                oversized=UploadFile(filename="large.png",file=io.BytesIO(png+(b"x"*(2*1024*1024))),headers=Headers({"content-type":"image/png"}))
                self.assertTrue(asyncio.run(main.upload_account_photo(oversized,participant_user))["image_available"])
                self.assertEqual(Path(main.account_photo(participant_user).path).stat().st_size,len(png)+2*1024*1024)
                too_large=UploadFile(filename="oversized.png",file=io.BytesIO(png+b"x"*5),headers=Headers({"content-type":"image/png"}))
                with patch.object(main,"MAX_PROFILE_IMAGE_BYTES",len(png)):
                    with self.assertRaises(HTTPException) as raised:
                        asyncio.run(main.upload_account_photo(too_large,participant_user))
                self.assertEqual(raised.exception.status_code,413)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload
                main.PROFILE_IMAGE_DIR=original_profiles

    def test_participant_profiles_and_direct_messages_are_shared_programme_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload,original_profiles=main.DB_PATH,main.UPLOAD_DIR,main.PROFILE_IMAGE_DIR
            main.DB_PATH=Path(directory)/"direct-messages.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.PROFILE_IMAGE_DIR=Path(directory)/"profile-photos"
            main.UPLOAD_DIR.mkdir();main.PROFILE_IMAGE_DIR.mkdir()
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Shared Org",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="temporary-passphrase-1"))
                other_organisation=main.setup(main.SetupInput(organisation_name="Other Org",organisation_type="Company",name="Other Organiser",username="other-organiser@example.test",password="temporary-passphrase-2"))
                first=main.register(main.RegisterInput(name="First Member",username="first@example.test",password="temporary-passphrase-3",consent_data=True))
                second=main.register(main.RegisterInput(name="Second Member",username="second@example.test",password="temporary-passphrase-4",consent_data=True))
                unrelated=main.register(main.RegisterInput(name="Unrelated Member",username="unrelated@example.test",password="temporary-passphrase-5",consent_data=True))
                with main.connect() as db:
                    shared_programme=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Shared programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    unrelated_programme=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(other_organisation["user"]["organisation_id"],"Other programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(shared_programme,"Session","live_online","2026-10-01T10:00:00+00:00","2026-10-01T11:00:00+00:00","profile-token")).lastrowid
                    for account,programme_id,status in ((first,shared_programme,"enrolled"),(second,shared_programme,"completed"),(unrelated,unrelated_programme,"enrolled")):
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,account["user"]["id"],status,main.now()))
                    db.execute("INSERT INTO attendance(session_id,participant_id,mode,percent,marked_at,valid) VALUES(?,?,?, ?,?,1)",(session_id,first["user"]["id"],"live",80,main.now()))
                    db.execute("INSERT INTO watch_progress(session_id,participant_id,segments,position,valid_seconds,duration_seconds,started_at) VALUES(?,?,?,?,?,?,?)",(session_id,first["user"]["id"],"[]",50,50,100,main.now()))
                    first_user=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_user=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                    unrelated_user=db.execute("SELECT * FROM users WHERE id=?",(unrelated["user"]["id"],)).fetchone()
                    organiser_user=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    other_organiser_user=db.execute("SELECT * FROM users WHERE id=?",(other_organisation["user"]["id"],)).fetchone()
                profile=main.participant_profile(second_user["id"],first_user)
                self.assertEqual(profile["programmes"][0]["status"],"completed")
                self.assertEqual(profile["programmes"][0]["attendance_percent"],0)
                self.assertEqual(profile["programmes"][0]["progress_percent"],0)
                self.assertEqual(main.participant_profile(first_user["id"],organiser_user)["programmes"][0]["attendance_percent"],80)
                with self.assertRaises(HTTPException) as raised:main.participant_profile(unrelated_user["id"],first_user)
                self.assertEqual(raised.exception.status_code,403)
                with self.assertRaises(HTTPException) as raised:main.participant_profile(second_user["id"],other_organiser_user)
                self.assertEqual(raised.exception.status_code,403)
                self.assertEqual([peer["id"] for peer in main.participant_peers(None,first_user)],[second_user["id"]])
                with self.assertRaises(HTTPException) as raised:main.create_participant_direct_conversation(unrelated_user["id"],shared_programme,first_user)
                self.assertEqual(raised.exception.status_code,403)
                conversation=main.create_participant_direct_conversation(second_user["id"],shared_programme,first_user)
                posted=main.send_participant_direct_message(conversation["id"],main.MessageInput(body="Hello"),first_user)
                self.assertEqual(posted["body"],"Hello")
                self.assertEqual(main.participant_direct_conversations(second_user)[0]["unread_count"],1)
                received=main.participant_direct_messages(conversation["id"],user=second_user)
                self.assertEqual(received[0]["body"],"Hello")
                self.assertEqual(main.participant_direct_conversations(second_user)[0]["unread_count"],0)
                with self.assertRaises(HTTPException) as raised:main.participant_direct_messages(conversation["id"],user=unrelated_user)
                self.assertEqual(raised.exception.status_code,404)
                with main.connect() as db:db.execute("UPDATE enrolments SET status='rejected' WHERE programme_id=? AND participant_id=?",(shared_programme,second_user["id"]))
                self.assertEqual(main.participant_direct_conversations(first_user),[])
                with self.assertRaises(HTTPException) as raised:main.participant_direct_messages(conversation["id"],user=first_user)
                self.assertEqual(raised.exception.status_code,403)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload
                main.PROFILE_IMAGE_DIR=original_profiles

    def test_programme_groups_enforce_membership_admins_and_admin_only_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload,original_profiles=main.DB_PATH,main.UPLOAD_DIR,main.PROFILE_IMAGE_DIR
            main.DB_PATH=Path(directory)/"groups.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.PROFILE_IMAGE_DIR=Path(directory)/"profile-photos"
            main.UPLOAD_DIR.mkdir();main.PROFILE_IMAGE_DIR.mkdir()
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Group Org",organisation_type="NGO",name="Group Owner",username="owner@example.test",password="Password123!"))
                approved=main.register(main.RegisterInput(name="Approved Member",username="approved@example.test",password="Password123!",consent_data=True))
                second=main.register(main.RegisterInput(name="Second Member",username="second@example.test",password="Password123!",consent_data=True))
                applicant=main.register(main.RegisterInput(name="Applicant",username="applicant@example.test",password="Password123!",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Group programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    for account,status in ((approved,"enrolled"),(second,"completed"),(applicant,"applied")):
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,account["user"]["id"],status,main.now()))
                    owner=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    member=db.execute("SELECT * FROM users WHERE id=?",(approved["user"]["id"],)).fetchone()
                    other=db.execute("SELECT * FROM users WHERE id=?",(applicant["user"]["id"],)).fetchone()
                groups=main.list_programme_groups(owner)
                self.assertEqual(groups[0]["member_count"],2)
                members=main.programme_group_members(programme_id,owner)
                self.assertEqual({item["name"] for item in members},{"Approved Member","Second Member"})
                admins=main.appoint_programme_group_admins(programme_id,main.GroupAdminsInput(user_ids=[member["id"]]),owner)
                self.assertEqual([item["name"] for item in admins],["Approved Member"])
                mode=main.update_programme_group_settings(programme_id,main.GroupSettingsInput(admin_only=True),owner)
                self.assertTrue(mode["admin_only"])
                with self.assertRaises(HTTPException) as raised:main.post_programme_group_message(programme_id,main.GroupMessageInput(body="Member post"),other)
                self.assertEqual(raised.exception.status_code,403)
                posted=main.post_programme_group_message(programme_id,main.GroupMessageInput(body="Welcome everyone"),member)
                self.assertEqual(posted["user_name"],"Approved Member")
                rows=main.programme_group_messages(programme_id,0,owner)
                self.assertEqual(rows[0]["body"],"Welcome everyone")
                profile=main.programme_group_member_profile(programme_id,member["id"],owner)
                self.assertEqual(profile["courses_applied"],1)
                self.assertEqual(profile["courses_approved"],1)
                self.assertEqual(profile["courses_completed"],0)
                with self.assertRaises(HTTPException) as raised:main.programme_group_member_profile(programme_id,other["id"],owner)
                self.assertEqual(raised.exception.status_code,404)
                with self.assertRaises(HTTPException) as raised:main.programme_group_messages(programme_id,0,other)
                self.assertEqual(raised.exception.status_code,403)
            finally:
                main.DB_PATH=original_db;main.UPLOAD_DIR=original_upload;main.PROFILE_IMAGE_DIR=original_profiles

    def test_organiser_can_delete_recording_and_captions_without_deleting_session(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload=main.DB_PATH,main.UPLOAD_DIR
            main.DB_PATH=Path(directory)/"delete-recording.db"
            main.UPLOAD_DIR=Path(directory)/"uploads";main.UPLOAD_DIR.mkdir()
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Video Org",organisation_type="NGO",name="Video Owner",username="video-owner@example.test",password="Password123!"))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Video programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    db.execute("INSERT INTO sessions(id,programme_id,title,kind,scheduled_start,scheduled_end,recording_file,captions_file,recording_no_expiry,qr_token) VALUES(1,?,?,?,?,?,?,?,?,?)",(programme_id,"Video session","live_online","2026-10-01T10:00:00+00:00","2026-10-01T11:00:00+00:00","class.webm","class.vtt",1,"token"))
                    db.execute("INSERT INTO live_sessions(session_id,state,started_at,recording_file) VALUES(1,'ended',?,'class.webm')",(main.now(),))
                    owner=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                video=main.UPLOAD_DIR/"class.webm";captions=main.UPLOAD_DIR/"class.vtt";video.write_bytes(b"video");captions.write_text("WEBVTT",encoding="utf-8")
                self.assertTrue(main.delete_recording(1,owner)["deleted"])
                self.assertFalse(video.exists());self.assertFalse(captions.exists())
                with main.connect() as db:
                    session=db.execute("SELECT recording_file,captions_file FROM sessions WHERE id=1").fetchone()
                    self.assertIsNotNone(db.execute("SELECT id FROM sessions WHERE id=1").fetchone())
                    self.assertIsNone(session["recording_file"]);self.assertIsNone(session["captions_file"])
                    self.assertIsNone(db.execute("SELECT recording_file FROM live_sessions WHERE session_id=1").fetchone()["recording_file"])
            finally:
                main.DB_PATH=original_db;main.UPLOAD_DIR=original_upload

    def test_live_session_access_is_scoped_to_enrolled_participants_and_owning_organisation(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"live-access.db"
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="test-password-123"))
                second=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="Company",name="Second Admin",username="second@example.test",password="test-password-123"))
                participant=main.register(main.RegisterInput(name="Member",username="member@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    programme_ids=[]
                    for organisation_id in (first["user"]["organisation_id"],second["user"]["organisation_id"]):
                        programme_ids.append(db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation_id,"Test programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid)
                    session_ids=[]
                    for programme_id in programme_ids:
                        session_ids.append(db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(programme_id,"Session","live_online","2026-10-01T10:00:00+00:00","2026-10-01T11:00:00+00:00","token")).lastrowid)
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_ids[0],participant["user"]["id"],"enrolled",main.now()))
                    self.assertTrue(main.can_join_live_session(db,first["user"]["id"],session_ids[0]))
                    self.assertFalse(main.can_join_live_session(db,first["user"]["id"],session_ids[1]))
                    self.assertTrue(main.can_join_live_session(db,participant["user"]["id"],session_ids[0]))
                    self.assertFalse(main.can_join_live_session(db,participant["user"]["id"],session_ids[1]))
            finally:main.DB_PATH=original

    def test_live_chat_and_video_comments_are_persisted_and_access_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload=main.DB_PATH,main.UPLOAD_DIR
            main.DB_PATH=Path(directory)/"session-discussion.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.UPLOAD_DIR.mkdir()
            try:
                main.init_db()
                organiser=main.setup(main.SetupInput(organisation_name="Test Organisation",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="organiser-password"))
                participant=main.register(main.RegisterInput(name="Enrolled participant",username="member@example.test",password="participant-password",consent_data=True))
                outsider=main.register(main.RegisterInput(name="Other participant",username="other@example.test",password="participant-password",consent_data=True))
                past=main.datetime.now(main.timezone.utc)-main.timedelta(days=20)
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organiser["user"]["organisation_id"],"Test programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,recording_file,deadline_days,qr_token) VALUES(?,?,?,?,?,?,?,?)",(programme_id,"Test session","live_online",past.isoformat(),(past+main.timedelta(hours=1)).isoformat(),"class.mp4",7,"session-token")).lastrowid
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["user"]["id"],"waitlisted",main.now()))
                    db.execute("INSERT INTO live_sessions(session_id,state,started_at) VALUES(?,'live',?)",(session_id,main.now()))
                    db.execute("INSERT INTO live_chat_messages(session_id,user_id,body,created_at) VALUES(?,?,?,?)",(session_id,participant["user"]["id"],"Hello class",main.now()))
                    (main.UPLOAD_DIR/"class.mp4").write_bytes(b"class video")
                    enrolled=db.execute("SELECT * FROM users WHERE id=?",(participant["user"]["id"],)).fetchone()
                    other=db.execute("SELECT * FROM users WHERE id=?",(outsider["user"]["id"],)).fetchone()
                    owner=db.execute("SELECT * FROM users WHERE id=?",(organiser["user"]["id"],)).fetchone()
                with self.assertRaises(HTTPException) as raised:main.get_recording(session_id,main.token_for(enrolled),Request({"type":"http","headers":[]}))
                self.assertEqual(raised.exception.status_code,403)
                visible_sessions=main.participant_sessions(enrolled)
                self.assertEqual(visible_sessions,[])
                with self.assertRaises(HTTPException) as raised:main.sessions(programme_id,enrolled)
                self.assertEqual(raised.exception.status_code,403)
                availability=main.set_recording_availability(session_id,main.RecordingAvailabilityInput(keep_available=True),owner)
                self.assertTrue(availability["keep_available"])
                with main.connect() as db:db.execute("UPDATE enrolments SET status='enrolled' WHERE programme_id=? AND participant_id=?",(programme_id,participant["user"]["id"]))
                visible_sessions=main.participant_sessions(enrolled)
                self.assertEqual(next(item for item in visible_sessions if item["id"]==session_id)["recording_file"],"class.mp4")
                playable=main.get_recording(session_id,main.token_for(enrolled),Request({"type":"http","headers":[]}))
                self.assertEqual(Path(playable.path).read_bytes(),b"class video")
                progress=main.get_progress(session_id,enrolled)
                self.assertEqual(progress["position"],0)
                saved_progress=main.update_progress(session_id,main.ProgressInput(segments=[[0,10]],position=10,duration_seconds=300),enrolled)
                self.assertFalse(saved_progress["completed"])
                with main.connect() as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM attendance WHERE session_id=?",(session_id,)).fetchone()[0],0)
                comment=main.add_video_comment(session_id,main.SessionCommentInput(body="Useful class"),enrolled)
                self.assertEqual(comment["body"],"Useful class")
                self.assertEqual([item["body"] for item in main.get_video_comments(session_id,enrolled)],["Useful class"])
                self.assertEqual([item["body"] for item in main.get_video_comments(session_id,owner)],["Useful class"])
                chat=main.get_live_chat(session_id,enrolled)
                self.assertEqual([message["body"] for message in chat],["Hello class"])
                with self.assertRaises(HTTPException) as raised:main.get_live_chat(session_id,other)
                self.assertEqual(raised.exception.status_code,403)
                with self.assertRaises(HTTPException) as raised:main.add_video_comment(session_id,main.SessionCommentInput(body="Not enrolled"),other)
                self.assertEqual(raised.exception.status_code,403)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload

    def test_session_delete_removes_dependents_and_recording_files(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload=main.DB_PATH,main.UPLOAD_DIR
            main.DB_PATH=Path(directory)/"session-delete.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.UPLOAD_DIR.mkdir()
            try:
                main.init_db()
                organiser=main.setup(main.SetupInput(organisation_name="Test Organisation",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="organiser-password"))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organiser["user"]["organisation_id"],"Test programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,recording_file,captions_file,qr_token) VALUES(?,?,?,?,?,?,?,?)",(programme_id,"Session","live_online","2026-10-01T10:00:00+00:00","2026-10-01T11:00:00+00:00","session.mp4","session.vtt","token")).lastrowid
                    participant_id=db.execute("INSERT INTO users(name,username,password_hash,role,created_at,organisation_id) VALUES(?,?,?,?,?,?)",("Member","member@example.test","hash","participant",main.now(),None)).lastrowid
                    db.execute("INSERT INTO attendance(session_id,participant_id,mode,percent,marked_at) VALUES(?,?,'physical_qr',100,?)",(session_id,participant_id,main.now()))
                    db.execute("INSERT INTO watch_progress(session_id,participant_id,started_at) VALUES(?,?,?)",(session_id,participant_id,main.now()))
                    db.execute("INSERT INTO live_sessions(session_id,state,started_at) VALUES(?,'ended',?)",(session_id,main.now()))
                    owner=db.execute("SELECT * FROM users WHERE id=?",(organiser["user"]["id"],)).fetchone()
                (main.UPLOAD_DIR/"session.mp4").write_bytes(b"video")
                (main.UPLOAD_DIR/"session.vtt").write_text("WEBVTT\n",encoding="utf-8")
                self.assertEqual(main.delete_session(session_id,owner),{"deleted":True})
                self.assertFalse((main.UPLOAD_DIR/"session.mp4").exists())
                self.assertFalse((main.UPLOAD_DIR/"session.vtt").exists())
                with main.connect() as db:
                    self.assertIsNone(db.execute("SELECT id FROM sessions WHERE id=?",(session_id,)).fetchone())
                    for table in ("attendance","watch_progress","live_sessions"):
                        self.assertEqual(db.execute(f"SELECT count(*) FROM {table} WHERE session_id=?",(session_id,)).fetchone()[0],0)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload

    def test_qr_attendance_recording_upload_and_participant_playback(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload=main.DB_PATH,main.UPLOAD_DIR
            main.DB_PATH=Path(directory)/"attendance-recording.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.UPLOAD_DIR.mkdir()
            try:
                main.init_db()
                organiser=main.setup(main.SetupInput(organisation_name="Test Organisation",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="StrongPass123!"))
                registration=main.register(main.RegisterInput(name="Participant",username="person@example.test",password="StrongPass123!",consent_data=True))
                future=main.datetime.now(main.timezone.utc)+main.timedelta(hours=1)
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organiser["user"]["organisation_id"],"Test programme","","Training","Physical","Community hall",future.date().isoformat(),(future+main.timedelta(days=14)).date().isoformat(),20,"Open","open",main.now())).lastrowid
                    session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,deadline_days,qr_token) VALUES(?,?,?,?,?,?,?)",(programme_id,"In-person session","physical",future.isoformat(),(future+main.timedelta(hours=1)).isoformat(),7,"session-qr-token")).lastrowid
                    participant_id=registration["user"]["id"]
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant_id,"enrolled",main.now()))
                    participant=db.execute("SELECT * FROM users WHERE id=?",(participant_id,)).fetchone()
                    organiser_row=db.execute("SELECT * FROM users WHERE id=?",(organiser["user"]["id"],)).fetchone()
                    db.execute("INSERT INTO live_sessions(session_id,state,started_at) VALUES(?,'live',?)",(session_id,main.now()))
                    old_heartbeat=(main.datetime.now(main.timezone.utc)-main.timedelta(minutes=1)).isoformat()
                    db.execute("INSERT INTO live_presence(session_id,participant_id,seconds,last_heartbeat,visible) VALUES(?,?,20,?,1)",(session_id,participant_id,old_heartbeat))
                signature=main.hmac.new(main.SECRET,f"participant:{participant_id}".encode(),main.hashlib.sha256).hexdigest()
                personal_qr=f"voxera:{participant_id}:{signature}"
                scanned=main.qr_checkin(main.CheckinInput(qr_token=personal_qr),session_id,organiser_row)
                self.assertTrue(scanned["checked_in"])
                self.assertEqual(scanned["participant_name"],"Participant")
                self.assertEqual(scanned["session_id"],session_id)
                participant_scan=main.qr_checkin(main.CheckinInput(qr_token="session-qr-token"),session_id,participant)
                self.assertTrue(participant_scan["checked_in"])
                manual=main.mark_attendance(session_id,participant_id,"physical_manual",organiser_row)
                self.assertTrue(manual["marked"])
                with main.connect() as db:
                    self.assertEqual(db.execute("SELECT mode FROM attendance WHERE session_id=? AND participant_id=?",(session_id,participant_id)).fetchone()["mode"],"physical_manual")
                    online_session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,deadline_days,qr_token) VALUES(?,?,?,?,?,?,?)",(programme_id,"Online session","live_online",future.isoformat(),(future+main.timedelta(hours=1)).isoformat(),7,"online-session-token")).lastrowid
                programme_report=next(item for item in main.reports(organiser_row)["programmes"] if item["id"]==programme_id)
                self.assertEqual(programme_report["physical"],1)
                with self.assertRaises(HTTPException) as raised:
                    main.qr_checkin(main.CheckinInput(qr_token=personal_qr),online_session_id,organiser_row)
                self.assertEqual(raised.exception.status_code,422)
                with self.assertRaises(HTTPException) as raised:
                    main.mark_attendance(online_session_id,participant_id,"physical_manual",organiser_row)
                self.assertEqual(raised.exception.status_code,422)
                with self.assertRaises(HTTPException) as raised:
                    main.mark_attendance(session_id,participant_id,"physical_qr",participant)
                self.assertEqual(raised.exception.status_code,403)
                main.live_heartbeat(session_id,main.HeartbeatInput(visible=False),participant)
                presence=main.live_heartbeat(session_id,main.HeartbeatInput(visible=True),participant)
                self.assertEqual(presence["present_seconds"],20)
                upload=UploadFile(filename="class.mp4",file=io.BytesIO(b"test recording"),headers=Headers({"content-type":"video/mp4"}))
                captions=UploadFile(filename="class.vtt",file=io.BytesIO(b"WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nWelcome to class.\n"),headers=Headers({"content-type":"text/vtt"}))
                uploaded=asyncio.run(main.upload_recording(session_id,upload,organiser_row,captions,False))
                self.assertTrue(uploaded["recording_available"])
                self.assertTrue(uploaded["captions_available"])
                self.assertEqual(main.MAX_RECORDING_BYTES,500_000_000)
                too_large=UploadFile(filename="too-large.mp4",file=io.BytesIO(b"123456789"),headers=Headers({"content-type":"video/mp4"}))
                with patch.object(main,"MAX_RECORDING_BYTES",8):
                    with self.assertRaises(HTTPException) as raised:asyncio.run(main.upload_recording(session_id,too_large,organiser_row))
                self.assertEqual(raised.exception.status_code,413)
                self.assertFalse(list(main.UPLOAD_DIR.glob(f"session-{session_id}-*.part")))
                with main.connect() as db:self.assertEqual(db.execute("SELECT recording_file FROM sessions WHERE id=?",(session_id,)).fetchone()["recording_file"],uploaded["filename"])
                playable=main.get_recording(session_id,main.token_for(participant),Request({"type":"http","headers":[]}))
                self.assertEqual(playable.media_type,"video/mp4")
                self.assertEqual(Path(playable.path).read_bytes(),b"test recording")
                caption_track=main.get_recording_captions(session_id,main.token_for(participant),Request({"type":"http","headers":[]}))
                self.assertEqual(caption_track.media_type,"text/vtt")
                self.assertIn("Welcome to class.",Path(caption_track.path).read_text(encoding="utf-8"))
                with main.connect() as db:db.execute("INSERT INTO watch_progress(session_id,participant_id,segments,position,valid_seconds,duration_seconds,started_at) VALUES(?,?,?,?,?,?,?)",(session_id,participant_id,"[[10,40]]",42,30,100,main.now()))
                progress=main.get_progress(session_id,participant)
                self.assertEqual(progress["position"],42)
                self.assertEqual(progress["percent"],30)
                self.assertEqual(progress["segments"],[[10,40]])
                codec_upload=UploadFile(filename="live.webm",file=io.BytesIO(b"webm recording"),headers=Headers({"content-type":"video/webm;codecs=vp8,opus"}))
                codec_result=asyncio.run(main.upload_recording(session_id,codec_upload,organiser_row,None,True))
                self.assertTrue(codec_result["recording_available"])
                self.assertTrue(codec_result["keep_available"])
                with main.connect() as db:self.assertEqual(db.execute("SELECT recording_no_expiry FROM sessions WHERE id=?",(session_id,)).fetchone()[0],1)
                live_playable=main.get_recording(session_id,main.token_for(participant),Request({"type":"http","headers":[]}))
                self.assertEqual(live_playable.media_type,"video/webm")
                m4v_upload=UploadFile(filename="class.m4v",file=io.BytesIO(b"m4v recording"),headers=Headers({"content-type":"video/x-m4v"}))
                asyncio.run(main.upload_recording(session_id,m4v_upload,organiser_row,None,False))
                self.assertEqual(main.get_recording(session_id,main.token_for(participant),Request({"type":"http","headers":[]})).media_type,"video/mp4")
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload

    def test_live_ice_server_configuration_is_validated(self):
        with patch.dict(main.os.environ,{"VOXERA_ICE_SERVERS":json.dumps([{"urls":"stun:stun.example.test:3478"},{"urls":"turn:turn.example.test:3478","username":"user","credential":"secret"}])}):
            self.assertEqual(len(main.configured_ice_servers()),2)
        with patch.dict(main.os.environ,{"VOXERA_ICE_SERVERS":"not-json"}):
            with self.assertRaises(HTTPException) as raised:
                main.configured_ice_servers()
            self.assertEqual(raised.exception.status_code,503)

    def test_message_catchup_returns_only_missed_items(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"messages.db"
            try:
                with main.connect() as db:
                    db.executescript("CREATE TABLE conversations(id INTEGER PRIMARY KEY,participant_id INTEGER,kind TEXT,programme_id INTEGER,created_at TEXT);CREATE TABLE messages(id INTEGER PRIMARY KEY,conversation_id INTEGER,sender_id INTEGER,body TEXT,audio_path TEXT,language TEXT,transcript TEXT,translation_en TEXT,ai INTEGER,delivered_at TEXT,read_at TEXT,created_at TEXT);")
                    db.execute("INSERT INTO conversations VALUES(1,7,'direct',NULL,'2026-01-01')")
                    for index in range(1,5):db.execute("INSERT INTO messages(id,conversation_id,body,created_at) VALUES(?,1,?,?)",(index,f"message-{index}","2026-01-01"))
                with main.connect() as db:participant=db.execute("SELECT 7 id,'participant' role").fetchone()
                missed=main.get_messages(1,2,participant)
                self.assertEqual([item['id'] for item in missed],[3,4])
            finally:main.DB_PATH=original

    def test_message_unread_counts_and_read_receipts_are_scoped_to_conversation_members(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"message-notifications.db"
            try:
                main.init_db()
                other_organiser=main.setup(main.SetupInput(organisation_name="Other Organisation",organisation_type="Company",name="Other organiser",username="other@example.test",password="different-test-password-456"))
                organiser=main.setup(main.SetupInput(organisation_name="Test Organisation",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="test-password-123"))
                participant=main.register(main.RegisterInput(name="Participant",username="person@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organiser["user"]["organisation_id"],"Test programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["user"]["id"],"enrolled",main.now()))
                    conversation_id=db.execute("INSERT INTO conversations(participant_id,kind,programme_id,created_at) VALUES(?,'programme',?,?)",(participant["user"]["id"],programme_id,main.now())).lastrowid
                    organiser_row=db.execute("SELECT * FROM users WHERE id=?",(organiser["user"]["id"],)).fetchone()
                    other_organiser_row=db.execute("SELECT * FROM users WHERE id=?",(other_organiser["user"]["id"],)).fetchone()
                    participant_row=db.execute("SELECT * FROM users WHERE id=?",(participant["user"]["id"],)).fetchone()
                    db.execute("INSERT INTO messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)",(conversation_id,participant["user"]["id"],"Hello team",main.now()))
                self.assertEqual(main.conversations(organiser_row)[0]["unread_count"],1)
                self.assertEqual(main.conversations(participant_row)[0]["unread_count"],0)
                with main.connect() as db:db.execute("INSERT INTO messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)",(conversation_id,organiser["user"]["id"],"Hello participant",main.now()))
                self.assertEqual(main.conversations(participant_row)[0]["unread_count"],1)
                self.assertEqual(main.mark_conversation_read(conversation_id,participant_row)["marked_read"],1)
                self.assertEqual(main.conversations(participant_row)[0]["unread_count"],0)
                with self.assertRaises(HTTPException) as raised:main.mark_conversation_read(conversation_id,other_organiser_row)
                self.assertEqual(raised.exception.status_code,404)
            finally:main.DB_PATH=original

    def test_participant_can_self_register_and_sign_in(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"accounts.db"
            try:
                main.init_db()
                main.setup(main.SetupInput(organisation_name="Test Organisation",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="organiser-password"))
                registered=main.register(main.RegisterInput(name="Participant",username="person@example.test",password="participant-password",consent_data=True))
                signed_in=main.login(main.LoginInput(username="person@example.test",password="participant-password"))
                self.assertEqual(registered["user"]["role"],"participant")
                self.assertEqual(signed_in["user"]["id"],registered["user"]["id"])
            finally:main.DB_PATH=original

    def test_organisation_registration_remains_open_after_initial_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"organisation-registration.db"
            try:
                main.init_db()
                self.assertTrue(main.setup_status()["setup_required"])
                make_account=lambda number: main.setup(main.SetupInput(
                    organisation_name=f"Organisation {number}",
                    organisation_type="NGO",
                    name=f"Organiser {number}",
                    username=f"organiser{number}@example.test",
                    password="test-password-123",
                ))
                first=make_account(1)
                self.assertFalse(main.setup_status()["setup_required"])
                second=make_account(2)
                self.assertNotEqual(first["user"]["organisation_id"],second["user"]["organisation_id"])
                self.assertEqual(len(main.setup_status()["organisations"]),2)
            finally:
                main.DB_PATH=original

    def test_participant_registration_is_global_and_programmes_are_multi_organisation(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"tenants.db"
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="first-admin-password"))
                second=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="Company",name="Second Admin",username="second@example.test",password="second-admin-password"))
                participant=main.register(main.RegisterInput(name="Member",username="member@example.test",password="member-password",consent_data=True))
                self.assertNotEqual(first["user"]["organisation_id"],second["user"]["organisation_id"])
                with main.connect() as db:
                    programme_ids=[]
                    for organisation_id,title in ((first["user"]["organisation_id"],"First programme"),(second["user"]["organisation_id"],"Second programme")):
                        programme_ids.append(db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation_id,title,"","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid)
                    stored=db.execute("SELECT organisation_id FROM users WHERE id=?",(participant["user"]["id"],)).fetchone()
                    self.assertIsNone(stored["organisation_id"])
                    participant_user=db.execute("SELECT u.*,EXISTS(SELECT 1 FROM platform_owners p WHERE p.user_id=u.id) is_platform_owner,0 organisation_archived FROM users u WHERE id=?",(participant["user"]["id"],)).fetchone()
                    first_user=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_user=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                available=main.list_programmes(participant_user)
                self.assertEqual({program["id"] for program in available},set(programme_ids))
                self.assertEqual(main.apply(programme_ids[1],participant_user)["status"],"applied")
                main.update_followup_settings(main.FollowupSettingsInput(max_per_week=4,triggers={"missed_session":False}),second_user)
                self.assertEqual(main.get_followup_settings(first_user)["max_per_week"],2)
                self.assertEqual(main.get_followup_settings(second_user)["max_per_week"],4)
                second_settings=main.get_followup_settings(second_user)
                self.assertFalse(second_settings["triggers"]["missed_session"])
                self.assertTrue(second_settings["triggers"]["missed_two"])
                self.assertEqual(second_settings["post_programme_limit"],3)
            finally:main.DB_PATH=original

    def test_followup_scheduler_infers_missed_attendance_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"followup-missed.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Follow-Up Org",organisation_type="NGO",name="Organiser",username="followup-organiser@example.test",password="StrongTestPassword123!"))
                registration=main.register(main.RegisterInput(name="Member",username="followup-member@example.test",password="StrongTestPassword123!",consent_data=True))
                end=(main.datetime.now(main.timezone.utc)-main.timedelta(days=2)).isoformat()
                start=(main.datetime.now(main.timezone.utc)-main.timedelta(days=2,hours=1)).isoformat()
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Follow-Up Course","","Training","Online","Remote","2025-01-01","2025-01-31",20,"Open","ongoing",main.now())).lastrowid
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,registration["user"]["id"],"enrolled",main.now()))
                    db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(programme_id,"Missed class","live_online",start,end,"followup-session-token"))
                    organiser=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                main.update_followup_settings(main.FollowupSettingsInput(triggers={"missed_session":True,"missed_two":False,"recording_deadline":False,"below_threshold":False,"outcome_checkins":False}),organiser)
                with patch.object(main.hub,"send",new=AsyncMock()):
                    self.assertEqual(asyncio.run(main.run_followup_for_organisation(organiser["organisation_id"])),1)
                    self.assertEqual(asyncio.run(main.run_followup_for_organisation(organiser["organisation_id"])),0)
                with main.connect() as db:
                    delivery=db.execute("SELECT * FROM followup_deliveries").fetchone()
                    message=db.execute("SELECT * FROM messages WHERE id=?",(db.execute("SELECT id FROM messages WHERE conversation_id=?",(delivery["conversation_id"],)).fetchone()["id"],)).fetchone()
                self.assertEqual(delivery["trigger_type"],"missed_session")
                self.assertEqual(message["ai"],1)
                self.assertIn("Missed class",message["body"])
                with main.connect() as db:
                    db.execute("INSERT INTO followup_cases(participant_id,programme_id,trigger_type,status,category,urgency,original_text,translation_en,summary,suggested_reply,created_at) VALUES(?,?,'automated_followup_reply','escalated','other','Normal','I need help','I need help','Needs staff','Team reply',?)",(registration["user"]["id"],delivery["programme_id"],main.now()))
                activity=main.followup_activity(organiser)
                self.assertEqual(len(activity),1)
                self.assertTrue(activity[0]["needs_reply"])
                self.assertEqual(activity[0]["participant_reply"],"I need help")
            finally:main.DB_PATH=original

    def test_post_programme_checkins_follow_configured_cadence_and_three_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"followup-outcomes.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Outcomes Org",organisation_type="NGO",name="Organiser",username="outcomes-organiser@example.test",password="StrongTestPassword123!"))
                registration=main.register(main.RegisterInput(name="Member",username="outcomes-member@example.test",password="StrongTestPassword123!",consent_data=True))
                old_end=(main.datetime.now(main.timezone.utc).date()-main.timedelta(days=100)).isoformat()
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Completed Course","","Training","Online","Remote","2025-01-01",old_end,20,"Open","completed",main.now())).lastrowid
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,registration["user"]["id"],"completed",main.now()))
                    organiser=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                main.update_followup_settings(main.FollowupSettingsInput(max_per_week=5,triggers={"missed_session":False,"missed_two":False,"recording_deadline":False,"below_threshold":False,"outcome_checkins":True},post_programme_interval_value=1,post_programme_interval_unit="months",post_programme_limit=3),organiser)
                with patch.object(main.hub,"send",new=AsyncMock()):
                    results=[asyncio.run(main.run_followup_for_organisation(organiser["organisation_id"])) for _ in range(4)]
                with main.connect() as db:
                    milestones={row["milestone"] for row in db.execute("SELECT milestone FROM outcome_checkins")}
                    deliveries=db.execute("SELECT count(*) FROM followup_deliveries WHERE trigger_type='outcome_checkin'").fetchone()[0]
                self.assertEqual(results,[1,1,1,0])
                self.assertEqual(milestones,{"automated-1","automated-2","automated-3"})
                self.assertEqual(deliveries,3)
            finally:main.DB_PATH=original

    def test_followup_thread_replies_get_ai_answer_or_staff_handoff(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"followup-replies.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Replies Org",organisation_type="NGO",name="Organiser",username="replies-organiser@example.test",password="StrongTestPassword123!"))
                registration=main.register(main.RegisterInput(name="Member",username="replies-member@example.test",password="StrongTestPassword123!",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Reply Course","","Training","Online","Remote","2025-01-01","2025-01-31",20,"Open","completed",main.now())).lastrowid
                    conversation_id=db.execute("INSERT INTO conversations(participant_id,kind,programme_id,created_at) VALUES(?,'ai_followup',?,?)",(registration["user"]["id"],programme_id,main.now())).lastrowid
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                answer={"answer":"Two plus two is 4.","grounded":False,"needs_human":False}
                with patch.object(main,"ollama_answer",return_value=answer),patch.object(main.hub,"send",new=AsyncMock()):
                    asyncio.run(main.send_message(conversation_id,main.MessageInput(body="What is 2 + 2?"),participant))
                with main.connect() as db:
                    latest=db.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1",(conversation_id,)).fetchone()
                    resolved=db.execute("SELECT status FROM followup_cases ORDER BY id DESC LIMIT 1").fetchone()
                self.assertEqual(latest["body"],answer["answer"])
                self.assertEqual(latest["ai"],1)
                self.assertEqual(resolved["status"],"ai_resolved")
                with patch.object(main.hub,"send",new=AsyncMock()):
                    asyncio.run(main.send_message(conversation_id,main.MessageInput(body="I need to speak to a person."),participant))
                with main.connect() as db:
                    latest=db.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1",(conversation_id,)).fetchone()
                    escalated=db.execute("SELECT status FROM followup_cases ORDER BY id DESC LIMIT 1").fetchone()
                self.assertEqual(latest["ai"],1)
                self.assertIn("programme team",latest["body"])
                self.assertEqual(escalated["status"],"escalated")
            finally:main.DB_PATH=original

    def test_organiser_cannot_access_another_tenant_programme(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"tenant-access.db"
            try:
                main.init_db()
                owner=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="first-admin-password"))
                other=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="Company",name="Second Admin",username="second@example.test",password="second-admin-password"))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(other["user"]["organisation_id"],"Private programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    user=db.execute("SELECT * FROM users WHERE id=?",(owner["user"]["id"],)).fetchone()
                    with self.assertRaises(HTTPException) as raised:main.tenant_programme(db,user,programme_id)
                    self.assertEqual(raised.exception.status_code,404)
            finally:main.DB_PATH=original

    def test_programme_messages_are_shared_only_by_applicant_and_owning_organisation(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"programme-messages.db"
            try:
                main.init_db()
                owner=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="first-admin-password"))
                other=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="Company",name="Second Admin",username="second@example.test",password="second-admin-password"))
                participant_registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="member-password",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(owner["user"]["organisation_id"],"First programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    participant=db.execute("SELECT * FROM users WHERE id=?",(participant_registration["user"]["id"],)).fetchone()
                    owner_user=db.execute("SELECT * FROM users WHERE id=?",(owner["user"]["id"],)).fetchone()
                    other_user=db.execute("SELECT * FROM users WHERE id=?",(other["user"]["id"],)).fetchone()
                main.apply(programme_id,participant)
                conversation=main.create_conversation(programme_id,None,participant)
                with main.connect() as db:
                    self.assertEqual(main.tenant_conversation(db,participant,conversation["id"])["id"],conversation["id"])
                    self.assertEqual(main.tenant_conversation(db,owner_user,conversation["id"])["id"],conversation["id"])
                    with self.assertRaises(HTTPException) as raised:
                        main.tenant_conversation(db,other_user,conversation["id"])
                    self.assertEqual(raised.exception.status_code,404)
                with self.assertRaises(HTTPException) as raised:
                    main.create_conversation(programme_id,participant["id"],other_user)
                self.assertEqual(raised.exception.status_code,404)
                self.assertEqual(main.create_conversation(programme_id,None,participant)["id"],conversation["id"])
            finally:main.DB_PATH=original

    def test_participants_can_start_tenant_scoped_organisation_chats(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"organisation-chat.db"
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="test-password-123"))
                second=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="Company",name="Second Admin",username="second@example.test",password="test-password-123"))
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    for organisation_id,title in ((first["user"]["organisation_id"],"First programme"),(second["user"]["organisation_id"],"Second programme")):
                        db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation_id,title,"","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now()))
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                    first_user=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_user=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                organisation_id=first["user"]["organisation_id"]
                conversation=main.create_conversation(organisation_id=organisation_id,user=participant)
                self.assertEqual(main.create_conversation(organisation_id=organisation_id,user=participant)["id"],conversation["id"])
                self.assertEqual(main.conversations(participant)[0]["organisation_name"],"First Org")
                self.assertEqual(main.conversations(first_user)[0]["participant_id"],participant["id"])
                self.assertEqual(main.conversations(second_user),[])
                with main.connect() as db:
                    self.assertEqual(main.tenant_conversation(db,participant,conversation["id"])["id"],conversation["id"])
                    self.assertEqual(main.tenant_conversation(db,first_user,conversation["id"])["id"],conversation["id"])
                    with self.assertRaises(HTTPException) as raised:
                        main.tenant_conversation(db,second_user,conversation["id"])
                    self.assertEqual(raised.exception.status_code,404)
                asyncio.run(main.send_message(conversation["id"],main.MessageInput(body="Hello"),participant))
                self.assertEqual(main.get_messages(conversation["id"],0,first_user)[0]["body"],"Hello")
                main.update_settings(main.OrganisationSettingsInput(name="First Org",type="NGO",ai_first_contact=False),first_user)
                self.assertFalse(main.settings(first_user)["ai_first_contact"])
                self.assertFalse(next(item for item in main.public_organisations() if item["id"]==organisation_id)["ai_first_contact"])
            finally:main.DB_PATH=original

    def test_open_admission_joins_immediately_and_both_roles_can_message(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"open-admission.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Open Skills",organisation_type="NGO",name="Admin",username="admin@example.test",password="admin-password"))
                participant_registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="member-password",consent_data=True))
                second_registration=main.register(main.RegisterInput(name="Second Member",username="second@example.test",password="second-password",consent_data=True))
                with main.connect() as db:
                    owner=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    participant=db.execute("SELECT * FROM users WHERE id=?",(participant_registration["user"]["id"],)).fetchone()
                    second=db.execute("SELECT * FROM users WHERE id=?",(second_registration["user"]["id"],)).fetchone()
                programme=main.create_programme(main.ProgrammeInput(title="Open workshop",start_date="2026-11-01",end_date="2026-11-30",capacity=1,admission_mode="open"),owner)
                self.assertEqual(programme["admission_mode"],"open")
                self.assertEqual(main.apply(programme["id"],participant)["status"],"enrolled")
                self.assertEqual(main.apply(programme["id"],second)["status"],"waitlisted")
                self.assertEqual(len(main.conversations(participant)),1)
                self.assertEqual(len(main.conversations(second)),1)
                conversation=main.create_conversation(programme["id"],None,participant)
                self.assertEqual(main.create_conversation(programme["id"],participant["id"],owner)["id"],conversation["id"])
                asyncio.run(main.send_message(conversation["id"],main.MessageInput(body="Hello organisation"),participant))
                messages=main.get_messages(conversation["id"],0,owner)
                self.assertEqual(messages[0]["body"],"Hello organisation")
                self.assertEqual(messages[0]["text"],"Hello organisation")
                self.assertFalse(messages[0]["mine"])
                asyncio.run(main.send_message(conversation["id"],main.MessageInput(body="Welcome aboard"),owner))
                messages=main.get_messages(conversation["id"],0,participant)
                self.assertTrue(messages[0]["mine"])
                self.assertEqual(messages[0]["text"],"Hello organisation")
                self.assertFalse(messages[1]["mine"])
                self.assertEqual(messages[1]["text"],"Welcome aboard")
                messages=main.get_messages(conversation["id"],1,participant)
                self.assertEqual(messages[0]["body"],"Welcome aboard")
                self.assertFalse(messages[0]["mine"])
                with main.connect() as db:
                    first_enrolment=db.execute("SELECT id FROM enrolments WHERE programme_id=? AND participant_id=?",(programme["id"],participant["id"])).fetchone()["id"]
                main.decision(first_enrolment,main.DecisionInput(status="dropped"),owner)
                with main.connect() as db:
                    promoted=db.execute("SELECT status FROM enrolments WHERE programme_id=? AND participant_id=?",(programme["id"],second["id"])).fetchone()["status"]
                self.assertEqual(promoted,"enrolled")
            finally:main.DB_PATH=original

    def test_assistant_answers_programme_questions_from_live_global_catalogue(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"assistant.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="admin-password"))
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="member-password",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Digital Skills","Learn practical digital skills","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open to everyone","open",main.now())).lastrowid
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                readiness=main.ai_status(participant)
                self.assertTrue(readiness["assistant"]["available"])
                self.assertEqual(readiness["voice"]["language"],"English")
                result=main.assistant_confirm(main.VoiceInput(text="Where is Digital Skills?",confirmed=True),participant)
                self.assertIn("Lagos",result["assistant_text"])
                self.assertEqual(result["programmes"][0]["id"],programme_id)
                self.assertTrue(result["grounded_in_programme_data"])
                with patch.object(main,"ollama_answer",return_value={"answer":"The programme includes weekly workshops.","grounded":True,"needs_human":False}):
                    general=main.assistant_confirm(main.VoiceInput(text="What is the Wi-Fi password?",confirmed=True),participant)
                self.assertEqual(general["assistant_text"],"The programme includes weekly workshops.")
                self.assertEqual(general["answer_source"],"local_model")
                preference=main.assistant_confirm(main.VoiceInput(text="How do I change my preferences?",confirmed=True),participant)
                self.assertIn("Open Profile",preference["assistant_text"])
                self.assertEqual(preference["answer_source"],"grounded_rules")
            finally:main.DB_PATH=original

    def test_assistant_greets_and_recommends_programmes_for_learning_interests(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"assistant-recommendations.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="test-password-123"))
                registered=main.register(main.RegisterInput(name="Learner",username="learner@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    coding=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Web Development","Practical coding and software development","Technology","Online","Lagos","2026-11-01","2026-11-30",20,"Open to everyone","open",main.now())).lastrowid
                    in_person=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"In-person Coding Workshop","Hands-on coding lessons","Technology","Physical","Lagos","2026-11-01","2026-11-30",20,"Open to everyone","open",main.now())).lastrowid
                    db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Urban Gardening","Learn to grow vegetables","Agriculture","Physical","Lagos","2026-11-01","2026-11-30",20,"Open to everyone","open",main.now()))
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registered["user"]["id"],)).fetchone()
                greeting=main.assistant_confirm(main.VoiceInput(text="Hello!",confirmed=True),participant)
                self.assertEqual(greeting["intent"],"greeting")
                self.assertIn("Ask me a question",greeting["assistant_text"])
                small_talk=main.assistant_confirm(main.VoiceInput(text="How are you doing today?",confirmed=True),participant)
                self.assertIn("thanks for asking",small_talk["assistant_text"])
                with patch.object(main,"ollama_answer",return_value={"answer":"14 squared is 196; plus 5 is 201.","grounded":False,"needs_human":False}) as local_ai:
                    maths=main.assistant_confirm(main.VoiceInput(text="What is 14 squared plus 5?",confirmed=True),participant)
                self.assertEqual(maths["assistant_text"],"14 squared is 196; plus 5 is 201.")
                self.assertEqual(maths["answer_source"],"local_model")
                local_ai.assert_called_once()
                with patch.object(main,"ollama_answer",return_value=None):
                    unavailable=main.assistant_confirm(main.VoiceInput(text="What is the capital of Mars?",confirmed=True),participant)
                self.assertEqual(unavailable["answer_source"],"unavailable")
                self.assertEqual(unavailable["action"],"none")
                self.assertNotIn("support_targets",unavailable)
                result=main.assistant_confirm(main.VoiceInput(text="I want to learn coding",confirmed=True),participant)
                self.assertEqual(result["intent"],"programme_recommendation")
                self.assertEqual({item["id"] for item in result["programmes"]},{coding,in_person})
                self.assertEqual(result["answer_source"],"grounded_rules")
                self.assertTrue(result["grounded_in_programme_data"])
                online=main.assistant_confirm(main.VoiceInput(text="I want to learn coding online",confirmed=True),participant)
                physical=main.assistant_confirm(main.VoiceInput(text="I want to learn coding in person",confirmed=True),participant)
                self.assertEqual([item["id"] for item in online["programmes"]],[coding])
                self.assertEqual([item["id"] for item in physical["programmes"]],[in_person])
            finally:
                main.DB_PATH=original

    def test_programme_reviews_are_limited_to_enrolled_or_completed_participants_and_upsert(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"programme-reviews.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="test-password-123"))
                eligible=main.register(main.RegisterInput(name="Enrolled Learner",username="enrolled@example.test",password="test-password-123",consent_data=True))
                applicant=main.register(main.RegisterInput(name="Applicant Learner",username="applicant@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    programme=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Coding Basics","Coding skills","Technology","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid
                    for registration,status in ((eligible,"enrolled"),(applicant,"applied")):
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme,registration["user"]["id"],status,main.now()))
                    enrolled_user=db.execute("SELECT * FROM users WHERE id=?",(eligible["user"]["id"],)).fetchone()
                    applicant_user=db.execute("SELECT * FROM users WHERE id=?",(applicant["user"]["id"],)).fetchone()
                with self.assertRaises(HTTPException) as denied:
                    main.save_programme_review(programme,main.ProgrammeReviewInput(rating=5,comment="Not yet enrolled"),applicant_user)
                self.assertEqual(denied.exception.status_code,403)
                main.save_programme_review(programme,main.ProgrammeReviewInput(rating=5,comment="Great coding practice"),enrolled_user)
                updated=main.save_programme_review(programme,main.ProgrammeReviewInput(rating=3,comment="Useful lessons"),enrolled_user)
                self.assertEqual(updated["average"],3.0)
                self.assertEqual(updated["count"],1)
                with main.connect() as db:
                    db.execute("UPDATE enrolments SET status='completed' WHERE programme_id=? AND participant_id=?",(programme,applicant["user"]["id"]))
                main.save_programme_review(programme,main.ProgrammeReviewInput(rating=5,comment="Finished the programme"),applicant_user)
                review_list=main.list_programme_reviews(programme,enrolled_user)
                self.assertTrue(review_list["eligible"])
                self.assertEqual(review_list["my_review"]["rating"],3)
                self.assertEqual(review_list["my_review"]["comment"],"Useful lessons")
                self.assertEqual(review_list["average"],4.0)
                self.assertEqual(len(review_list["reviews"]),2)
                listed=main.list_programmes(enrolled_user)
                self.assertEqual(next(item for item in listed if item["id"]==programme)["rating_average"],4.0)
                with main.connect() as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM programme_reviews WHERE programme_id=?",(programme,)).fetchone()[0],2)
                    self.assertEqual(db.execute("SELECT count(*) FROM programme_reviews WHERE programme_id=? AND participant_id=?",(programme,eligible["user"]["id"])).fetchone()[0],1)
            finally:
                main.DB_PATH=original

    def test_platform_owner_controls_are_separate_audited_and_reversible(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"owner-console.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="test-password-123"))
                participant=main.register(main.RegisterInput(name="Learner",username="learner@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    owner_id=db.execute("INSERT INTO users(name,username,password_hash,role,created_at) VALUES(?,?,?,'admin',?)",("Owner","owner@example.test",main.password_hash("owner-password-123"),main.now())).lastrowid
                    db.execute("INSERT INTO platform_owners(user_id,created_at) VALUES(?,?)",(owner_id,main.now()))
                    db.execute("INSERT INTO users(name,username,password_hash,role,created_at) VALUES(?,?,?,'admin',?)",("Legacy Admin","legacy-admin@example.test",main.password_hash("legacy-password-123"),main.now()))
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Digital Skills","Learn coding","Technology","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid
                    session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(programme_id,"Intro","live_online","2026-11-02T10:00:00+00:00","2026-11-02T11:00:00+00:00","owner-live-token")).lastrowid
                    owner=db.execute("SELECT u.*,EXISTS(SELECT 1 FROM platform_owners p WHERE p.user_id=u.id) is_platform_owner FROM users u WHERE id=?",(owner_id,)).fetchone()
                    participant_user=db.execute("SELECT u.*,EXISTS(SELECT 1 FROM platform_owners p WHERE p.user_id=u.id) is_platform_owner,0 organisation_archived FROM users u WHERE id=?",(participant["user"]["id"],)).fetchone()
                owner_login=main.platform_owner_login(main.LoginInput(username="owner@example.test",password="owner-password-123"))
                self.assertTrue(owner_login["user"]["is_platform_owner"])
                with self.assertRaises(HTTPException) as regular_login:
                    main.login(main.LoginInput(username="owner@example.test",password="owner-password-123"))
                self.assertEqual(regular_login.exception.status_code,403)
                with self.assertRaises(HTTPException) as legacy_login:
                    main.login(main.LoginInput(username="legacy-admin@example.test",password="legacy-password-123"))
                self.assertEqual(legacy_login.exception.status_code,403)
                with self.assertRaises(HTTPException) as forbidden:
                    main.require_platform_owner(participant_user)
                self.assertEqual(forbidden.exception.status_code,403)
                self.assertEqual(main.login(main.LoginInput(username="learner@example.test",password="test-password-123"))["user"]["role"],"participant")
                with main.connect() as db:
                    self.assertFalse(main.can_join_live_session(db,owner_id,session_id))
                self.assertEqual(main.owner_overview(owner)["counts"]["participants"],1)
                self.assertEqual(main.owner_users(q="learner@example.test",user=owner)["items"][0]["email"],"learner@example.test")
                blocked=main.owner_set_account_active(participant["user"]["id"],main.AdminAccountStatusInput(active=False,reason="Account review"),owner)
                self.assertFalse(blocked["active"])
                with self.assertRaises(HTTPException) as blocked_login:
                    main.login(main.LoginInput(username="learner@example.test",password="test-password-123"))
                self.assertEqual(blocked_login.exception.status_code,403)
                main.owner_set_account_active(participant["user"]["id"],main.AdminAccountStatusInput(active=True,reason="Review complete"),owner)
                main.owner_set_programme_blocked(programme_id,main.AdminProgrammeModerationInput(blocked=True,reason="Policy review"),owner)
                self.assertNotIn(programme_id,{item["id"] for item in main.list_programmes(participant_user)})
                with self.assertRaises(HTTPException) as blocked_apply:
                    main.apply(programme_id,participant_user)
                self.assertEqual(blocked_apply.exception.status_code,409)
                with main.connect() as db:
                    organiser_user=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                with self.assertRaises(HTTPException) as blocked_session:
                    main.create_session(programme_id,main.SessionInput(title="New session",scheduled_start="2026-11-03T10:00:00+00:00",scheduled_end="2026-11-03T11:00:00+00:00"),organiser_user)
                self.assertEqual(blocked_session.exception.status_code,409)
                main.owner_set_programme_blocked(programme_id,main.AdminProgrammeModerationInput(blocked=False,reason="Review complete"),owner)
                main.owner_set_organisation_archived(organisation["user"]["organisation_id"],main.AdminArchiveInput(archived=True,reason="Organisation review"),owner)
                self.assertEqual(main.owner_organisations(owner)[0]["is_archived"],1)
                with self.assertRaises(HTTPException) as archived_login:
                    main.login(main.LoginInput(username="organiser@example.test",password="test-password-123"))
                self.assertEqual(archived_login.exception.status_code,403)
                main.owner_set_organisation_archived(organisation["user"]["organisation_id"],main.AdminArchiveInput(archived=False,reason="Review complete"),owner)
                with patch.object(main,"owner_local_ai_answer",return_value=None):
                    assistant=main.owner_assistant(main.OwnerAssistantInput(question="What's happening across programmes?"),owner)
                self.assertFalse(assistant["external_ai_used"])
                self.assertEqual(assistant["source"],"local_rules")
                self.assertTrue(assistant["read_only"])
                with main.connect() as db:
                    events={row["action"] for row in db.execute("SELECT action FROM audit_log WHERE user_id=?",(owner_id,)).fetchall()}
                    self.assertTrue({"platform_owner_signed_in","account_blocked","programme_blocked","organisation_archived","owner_assistant_queried"}.issubset(events))
            finally:
                main.DB_PATH=original

    def test_platform_owner_participant_deletion_requires_reauthentication_and_cleans_records(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"owner-delete.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="test-password-123"))
                participant=main.register(main.RegisterInput(name="Learner",username="learner@example.test",password="test-password-123",consent_data=True))
                with main.connect() as db:
                    owner_id=db.execute("INSERT INTO users(name,username,password_hash,role,created_at) VALUES(?,?,?,'admin',?)",("Owner","owner@example.test",main.password_hash("owner-password-123"),main.now())).lastrowid
                    db.execute("INSERT INTO platform_owners(user_id,created_at) VALUES(?,?)",(owner_id,main.now()))
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Digital Skills","Learn coding","Technology","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["user"]["id"],"enrolled",main.now()))
                    db.execute("INSERT INTO outcome_checkins(participant_id,programme_id,milestone,prompt,created_at) VALUES(?,?,?,?,?)",(participant["user"]["id"],programme_id,"followup","How is it going?",main.now()))
                    conversation_id=db.execute("INSERT INTO conversations(participant_id,kind,programme_id,created_at) VALUES(?,'programme',?,?)",(participant["user"]["id"],programme_id,main.now())).lastrowid
                    db.execute("INSERT INTO messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)",(conversation_id,participant["user"]["id"],"Hello",main.now()))
                    owner=db.execute("SELECT u.*,EXISTS(SELECT 1 FROM platform_owners p WHERE p.user_id=u.id) is_platform_owner FROM users u WHERE id=?",(owner_id,)).fetchone()
                with self.assertRaises(HTTPException) as denied:
                    main.delete_participant(participant["user"]["id"],main.AdminDeleteParticipantInput(password="wrong-password",confirm_email="learner@example.test"),owner)
                self.assertEqual(denied.exception.status_code,403)
                with self.assertRaises(HTTPException) as mismatch:
                    main.delete_participant(participant["user"]["id"],main.AdminDeleteParticipantInput(password="owner-password-123",confirm_email="wrong@example.test"),owner)
                self.assertEqual(mismatch.exception.status_code,422)
                result=main.delete_participant(participant["user"]["id"],main.AdminDeleteParticipantInput(password="owner-password-123",confirm_email="learner@example.test"),owner)
                self.assertTrue(result["deleted"])
                with main.connect() as db:
                    self.assertIsNone(db.execute("SELECT 1 FROM users WHERE id=?",(participant["user"]["id"],)).fetchone())
                    self.assertEqual(db.execute("SELECT count(*) FROM outcome_checkins WHERE participant_id=?",(participant["user"]["id"],)).fetchone()[0],0)
                    self.assertEqual(db.execute("SELECT count(*) FROM audit_log WHERE action='participant_deleted' AND user_id=?",(owner["id"],)).fetchone()[0],1)
                    self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])
            finally:
                main.DB_PATH=original

    def test_human_handoff_requires_an_explicit_programme_and_shows_organisation(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"support-targets.db"
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="North Skills",organisation_type="NGO",name="North Admin",username="north@example.test",password="StrongTestPassword123!"))
                second=main.setup(main.SetupInput(organisation_name="Health Partners",organisation_type="Company",name="Health Admin",username="health@example.test",password="StrongTestPassword123!"))
                registered=main.register(main.RegisterInput(name="Member",username="member@example.test",password="StrongTestPassword123!",consent_data=True))
                with main.connect() as db:
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registered["user"]["id"],)).fetchone()
                    programme_ids=[]
                    for organisation_id,title in ((first["user"]["organisation_id"],"Digital Skills"),(second["user"]["organisation_id"],"Health Champions")):
                        programme_ids.append(db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation_id,title,"Programme details","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open to participants","open",main.now())).lastrowid)
                no_programmes=main.assistant_confirm(main.VoiceInput(text="I want to speak to a person",confirmed=True),participant)
                self.assertEqual(no_programmes["action"],"contact_staff")
                self.assertIn("Discover",no_programmes["assistant_text"])
                with main.connect() as db:
                    for programme_id in programme_ids:
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["id"],"enrolled",main.now()))
                handoff=main.assistant_confirm(main.VoiceInput(text="I want to speak to a person",confirmed=True),participant)
                self.assertEqual(handoff["action"],"choose_support_target")
                self.assertEqual({target["organisation_name"] for target in handoff["support_targets"]},{"North Skills","Health Partners"})
                self.assertNotIn("conversation_id",handoff)
                with main.connect() as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM followup_cases").fetchone()[0],0)
                    self.assertEqual(db.execute("SELECT count(*) FROM conversations").fetchone()[0],0)
                sent=main.assistant_confirm(main.VoiceInput(text="I want to speak to a person",programme_id=programme_ids[1],confirmed=True),participant)
                self.assertEqual(sent["programme_id"],programme_ids[1])
                with main.connect() as db:
                    case=db.execute("SELECT programme_id FROM followup_cases").fetchone()
                    self.assertEqual(case["programme_id"],programme_ids[1])
                    owner=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                ended=main.complete_programme(programme_ids[0],owner)
                self.assertTrue(ended["completed"])
                organisation_summary=next(item for item in main.public_organisations() if item["id"]==first["user"]["organisation_id"])
                self.assertEqual(organisation_summary["active_programmes"],0)
                self.assertEqual(organisation_summary["completed_programmes"],1)
                public_orgs=main.public_organisations()
                self.assertEqual(len(public_orgs),2)
                with main.connect() as db:
                    ended_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(first["user"]["organisation_id"],"Past Programme","Past details","Training","Online","Lagos","2026-10-01","2026-10-20",20,"Open","completed",main.now())).lastrowid
                history=main.public_organisation_programmes(first["user"]["organisation_id"],participant)
                self.assertIn(ended_id,{programme["id"] for programme in history["programmes"]})
                self.assertEqual(next(p for p in history["programmes"] if p["id"]==ended_id)["status"],"completed")
            finally:main.DB_PATH=original

    def test_ended_programmes_block_new_sessions_live_classes_and_video_uploads(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload,original_profiles=main.DB_PATH,main.UPLOAD_DIR,main.PROFILE_IMAGE_DIR
            main.DB_PATH=Path(directory)/"ended-programme.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.PROFILE_IMAGE_DIR=Path(directory)/"profile-photos"
            main.UPLOAD_DIR.mkdir();main.PROFILE_IMAGE_DIR.mkdir()
            try:
                main.init_db()
                account=main.setup(main.SetupInput(organisation_name="Ended Programme Org",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="temporary-passphrase"))
                organiser_id=account["user"]["id"]
                with main.connect() as db:
                    organiser=db.execute("SELECT * FROM users WHERE id=?",(organiser_id,)).fetchone()
                programme=main.create_programme(main.ProgrammeInput(title="Current Programme",start_date="2026-10-01",end_date="2026-10-31",status="open"),organiser)
                programme_id=programme["id"]
                session=main.create_session(programme_id,main.SessionInput(title="Live workshop",description="A practical session with guided activities.",kind="live_online",scheduled_start="2026-10-08T10:00:00+00:00",scheduled_end="2026-10-08T11:00:00+00:00"),organiser)
                self.assertEqual(session["description"],"A practical session with guided activities.")
                session_id=session["id"]
                started=main.live_state(session_id,main.LiveInput(active=True),organiser)
                self.assertEqual(started["state"],"live")
                with self.assertRaises(HTTPException) as raised:main.complete_programme(programme_id,organiser)
                self.assertEqual(raised.exception.status_code,409)
                main.live_state(session_id,main.LiveInput(active=False),organiser)
                self.assertTrue(main.complete_programme(programme_id,organiser)["completed"])
                edited=main.update_programme(programme_id,main.ProgrammeInput(title="Updated current programme",start_date="2026-10-01",end_date="2026-10-31",status="completed"),organiser)
                self.assertEqual(edited["title"],"Updated current programme")
                with self.assertRaises(HTTPException) as raised:main.update_programme(programme_id,main.ProgrammeInput(title="Reopened programme",start_date="2026-10-01",end_date="2026-10-31",status="open"),organiser)
                self.assertEqual(raised.exception.status_code,409)
                new_session=main.SessionInput(title="Another workshop",kind="live_online",scheduled_start="2026-10-09T10:00:00+00:00",scheduled_end="2026-10-09T11:00:00+00:00")
                with self.assertRaises(HTTPException) as raised:main.create_session(programme_id,new_session,organiser)
                self.assertEqual(raised.exception.status_code,409)
                with self.assertRaises(HTTPException) as raised:main.live_state(session_id,main.LiveInput(active=True),organiser)
                self.assertEqual(raised.exception.status_code,409)
                upload=UploadFile(filename="class.mp4",file=io.BytesIO(b"video"),headers=Headers({"content-type":"video/mp4"}))
                with self.assertRaises(HTTPException) as raised:asyncio.run(main.upload_recording(session_id,upload,organiser))
                self.assertEqual(raised.exception.status_code,409)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload
                main.PROFILE_IMAGE_DIR=original_profiles

    def test_organisation_public_profiles_programme_tabs_and_ai_handoffs_are_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_upload,original_profiles=main.DB_PATH,main.UPLOAD_DIR,main.PROFILE_IMAGE_DIR
            main.DB_PATH=Path(directory)/"organisation-profiles.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.PROFILE_IMAGE_DIR=Path(directory)/"profile-photos"
            main.UPLOAD_DIR.mkdir();main.PROFILE_IMAGE_DIR.mkdir()
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="Community Learning",organisation_type="NGO",name="First Organiser",username="first-org@example.test",password="temporary-passphrase"))
                second=main.setup(main.SetupInput(organisation_name="Health Community",organisation_type="Company",name="Second Organiser",username="second-org@example.test",password="temporary-passphrase"))
                participant_result=main.register(main.RegisterInput(name="Participant",username="participant@example.test",password="temporary-passphrase",consent_data=True))
                with main.connect() as db:
                    first_user=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_user=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                    participant=db.execute("SELECT * FROM users WHERE id=?",(participant_result["user"]["id"],)).fetchone()
                    programme_ids=[]
                    for organisation_id,title,status in ((first["user"]["organisation_id"],"Active course","open"),(first["user"]["organisation_id"],"Past course","completed"),(second["user"]["organisation_id"],"Other course","open")):
                        programme_ids.append(db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation_id,title,"Course description","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open",status,main.now())).lastrowid)
                    for programme_id in (programme_ids[0],programme_ids[2]):
                        db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant["id"],"enrolled",main.now()))
                update=main.update_settings(main.OrganisationSettingsInput(name="Community Learning",type="NGO",description="Skills for local communities.",website_url="https://community.example.org",contact_email="hello@community.example.org",contact_phone="+1 555 0100",location="North District",social_links={"instagram":"https://instagram.com/community"}),first_user)
                self.assertEqual(update["description"],"Skills for local communities.")
                self.assertEqual(update["social_links"]["instagram"],"https://instagram.com/community")
                self.assertEqual(update["contact_email"],"hello@community.example.org")
                self.assertEqual(update["contact_phone"],"+1 555 0100")
                self.assertEqual(update["location"],"North District")
                banner_bytes=b"\x89PNG\r\n\x1a\n"+(b"b"*(2*1024*1024))
                banner=main.UploadFile(filename="banner.png",file=io.BytesIO(banner_bytes),headers=Headers({"content-type":"image/png"}))
                self.assertTrue(asyncio.run(main.upload_organisation_banner(banner,first_user))["banner_available"])
                settings=main.settings(first_user)
                self.assertTrue(settings["banner_available"])
                self.assertEqual(settings["contact_email"],"hello@community.example.org")
                organiser_banner=main.organisation_banner(first_user)
                self.assertEqual(Path(organiser_banner.path).read_bytes(),banner_bytes)
                self.assertEqual(organiser_banner.headers["cache-control"],"private, no-store")
                with self.assertRaises(HTTPException) as raised:main.organisation_banner(second_user)
                self.assertEqual(raised.exception.status_code,404)
                with self.assertRaises(HTTPException) as raised:main.update_settings(main.OrganisationSettingsInput(name="Community Learning",type="NGO",social_links={"instagram":"javascript:alert(1)"}),first_user)
                self.assertEqual(raised.exception.status_code,422)
                with self.assertRaises(HTTPException) as raised:main.update_settings(main.OrganisationSettingsInput(name="Community Learning",type="NGO",contact_email="invalid-email"),first_user)
                self.assertEqual(raised.exception.status_code,422)
                public_profile=next(item for item in main.public_organisations() if item["id"]==first["user"]["organisation_id"])
                self.assertEqual(public_profile["description"],"Skills for local communities.")
                self.assertEqual(public_profile["banner_url"],f"/api/organisations/{first['user']['organisation_id']}/banner")
                self.assertEqual(public_profile["location"],"North District")
                public_banner=main.public_organisation_banner(first["user"]["organisation_id"])
                self.assertTrue(Path(public_banner.path).is_file())
                self.assertEqual(Path(public_banner.path).stat().st_size,len(banner_bytes))
                self.assertEqual(public_banner.headers["cache-control"],"no-cache")
                previous_banner=Path(public_banner.path)
                invalid_banner=main.UploadFile(filename="invalid.png",file=io.BytesIO(b"not an image"),headers=Headers({"content-type":"image/png"}))
                with self.assertRaises(HTTPException) as raised:asyncio.run(main.upload_organisation_banner(invalid_banner,first_user))
                self.assertEqual(raised.exception.status_code,415)
                self.assertFalse(any(main.PROFILE_IMAGE_DIR.glob("organisation-banner-*.upload")))
                replacement_bytes=b"\x89PNG\r\n\x1a\n"+(b"r"*(3*1024*1024))
                replacement=main.UploadFile(filename="replacement.png",file=io.BytesIO(replacement_bytes),headers=Headers({"content-type":"image/png"}))
                self.assertTrue(asyncio.run(main.upload_organisation_banner(replacement,first_user))["banner_available"])
                replacement_banner=main.public_organisation_banner(first["user"]["organisation_id"])
                replacement_banner_path=Path(replacement_banner.path)
                self.assertEqual(replacement_banner_path.read_bytes(),replacement_bytes)
                self.assertFalse(previous_banner.exists())
                self.assertTrue(main.delete_organisation_banner(first_user)["removed"])
                self.assertFalse(replacement_banner_path.exists())
                self.assertFalse(main.delete_organisation_banner(first_user)["banner_available"])
                with self.assertRaises(HTTPException) as raised:main.public_organisation_banner(first["user"]["organisation_id"])
                self.assertEqual(raised.exception.status_code,404)
                with self.assertRaises(HTTPException) as raised:main.organisation_banner(first_user)
                self.assertEqual(raised.exception.status_code,404)
                self.assertNotIn("image_filename",public_profile)
                history=main.public_organisation_programmes(first["user"]["organisation_id"],participant)
                self.assertEqual(history["organisation"]["website_url"],"https://community.example.org")
                self.assertEqual({programme["status"] for programme in history["programmes"]},{"open","completed"})
                question=main.assistant_confirm(main.VoiceInput(text="What does this organisation do?",organisation_id=first["user"]["organisation_id"],confirmed=True),participant)
                self.assertIn("Skills for local communities.",question["assistant_text"])
                handoff=main.assistant_confirm(main.VoiceInput(text="I want to speak to a person",organisation_id=first["user"]["organisation_id"],confirmed=True),participant)
                self.assertEqual(handoff["action"],"choose_support_target")
                self.assertEqual([target["programme_id"] for target in handoff["support_targets"]],[programme_ids[0]])
                with self.assertRaises(HTTPException) as raised:main.assistant_confirm(main.VoiceInput(text="I want to speak to a person",programme_id=programme_ids[2],organisation_id=first["user"]["organisation_id"],confirmed=True),participant)
                self.assertEqual(raised.exception.status_code,403)
                with self.assertRaises(HTTPException) as raised:main.public_organisation_photo(first["user"]["organisation_id"])
                self.assertEqual(raised.exception.status_code,404)
            finally:
                main.DB_PATH=original_db
                main.UPLOAD_DIR=original_upload
                main.PROFILE_IMAGE_DIR=original_profiles

    def test_hosted_assistant_uses_opted_in_participant_context_only(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"hosted-assistant.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="safe-test-password"))
                participant_result=main.register(main.RegisterInput(name="Member",username="member@example.test",password="safe-test-password",consent_data=True,consent_remote_ai=True))
                other_result=main.register(main.RegisterInput(name="Other Member",username="other@example.test",password="safe-test-password",consent_data=True))
                with main.connect() as db:
                    org_id=organisation["user"]["organisation_id"]
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(org_id,"Digital Skills","Learn practical digital skills","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid
                    private_programme=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(org_id,"Private staff review","Restricted details","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Staff only","closed",main.now())).lastrowid
                    participant_id=participant_result["user"]["id"]
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant_id,"enrolled",main.now()))
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(private_programme,other_result["user"]["id"],"enrolled",main.now()))
                    start=(main.datetime.now(main.timezone.utc)+main.timedelta(days=3)).isoformat()
                    end=(main.datetime.now(main.timezone.utc)+main.timedelta(days=3,hours=1)).isoformat()
                    db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(programme_id,"Digital portfolio workshop","live_online",start,end,"participant-session"))
                    db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(private_programme,"Confidential review session","live_online",start,end,"other-session"))
                    participant=db.execute("SELECT * FROM users WHERE id=?",(participant_id,)).fetchone()
                response={"answer":"Your next class is the digital portfolio workshop.","grounded":True,"needs_human":False}
                with patch.object(main,"hosted_ai_chat",side_effect=[json.dumps(response),json.dumps(response)]) as provider:
                    result=main.assistant_confirm(main.VoiceInput(text="What should I prepare for my upcoming class?",confirmed=True),participant)
                    question_result=main.assistant_confirm(main.VoiceInput(text="Is there a bus to the workshop?",confirmed=True),participant)
                self.assertEqual(result["assistant_text"],response["answer"])
                self.assertEqual(result["answer_source"],"hosted_model")
                self.assertTrue(result["grounded_in_programme_data"])
                submitted=provider.call_args_list[0].args[1]
                self.assertIn("Digital portfolio workshop",submitted)
                self.assertNotIn("Confidential review session",submitted)
                self.assertNotIn("other@example.test",submitted)
                self.assertEqual(question_result["answer_source"],"hosted_model")
            finally:main.DB_PATH=original

    def test_hosted_assistant_requires_remote_ai_consent_and_honours_human_request(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"assistant-consent.db"
            try:
                main.init_db()
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="safe-test-password",consent_data=True))
                with main.connect() as db:participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                with patch.object(main,"hosted_ai_answer",return_value={"answer":"A hosted answer","grounded":False,"needs_human":False}) as hosted, patch.object(main,"ollama_answer",return_value={"answer":"A local answer","grounded":True,"needs_human":False}):
                    result=main.assistant_confirm(main.VoiceInput(text="How can I build a study habit?",confirmed=True),participant)
                hosted.assert_not_called()
                self.assertEqual(result["answer_source"],"local_model")
                with patch.object(main,"ollama_answer",return_value={"answer":"A staff member should review this.","grounded":False,"needs_human":True}):
                    handoff=main.assistant_confirm(main.VoiceInput(text="Can a staff member make an exception?",confirmed=True),participant)
                self.assertEqual(handoff["action"],"contact_staff")
                classification={"category":"transport","confidence":0.94,"needs_human":False,"urgency":"Normal","summary":"Asked about a route","suggested_reply":"Check the route information."}
                with patch.object(main,"hosted_ai_classify",return_value=classification):
                    sorted_case=main.classify("I cannot arrange my journey.",remote_ai=True)
                self.assertEqual(sorted_case["category"],"transport")
                self.assertFalse(sorted_case["needs_human"])
                with patch.object(main,"hosted_ai_classify",return_value={"category":"other","confidence":0.99,"needs_human":False,"urgency":"Normal","summary":"classified","suggested_reply":"reply"}) as classifier:
                    human=main.classify("Please let me speak to a person.",explicit=True,remote_ai=True)
                classifier.assert_not_called()
                self.assertTrue(human["needs_human"])
                self.assertEqual(human["category"],"wants_human")
            finally:main.DB_PATH=original

    def test_hosted_ai_client_posts_json_to_configured_openai_compatible_endpoint(self):
        response_body={"choices":[{"message":{"content":"{\"answer\":\"Ready\",\"grounded\":true,\"needs_human\":false}"}}]}
        with patch.dict("os.environ",{"VOXERA_AI_API_KEY":"test-secret","VOXERA_AI_BASE_URL":"https://ai.example/v1","VOXERA_AI_MODEL":"test-model"}), patch("urllib.request.urlopen",return_value=io.BytesIO(json.dumps(response_body).encode())) as urlopen:
            result=main.hosted_ai_chat("system","question")
        request=urlopen.call_args.args[0]
        self.assertEqual(request.full_url,"https://ai.example/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"),"Bearer test-secret")
        self.assertEqual(json.loads(request.data)["model"],"test-model")
        self.assertEqual(result,response_body["choices"][0]["message"]["content"])

    def test_ollama_assistant_accepts_unmatched_general_and_math_answers(self):
        answer={"answer":"14 squared is 196; plus 5 is 201.","grounded":False,"needs_human":False}
        response_body={"response":json.dumps(answer)}
        with patch("urllib.request.urlopen",return_value=io.BytesIO(json.dumps(response_body).encode())) as urlopen:
            result=main.ollama_answer("What is 14 squared plus 5?",[])
        self.assertEqual(result,answer)
        prompt=json.loads(urlopen.call_args.args[0].data)["prompt"]
        self.assertIn("general knowledge",prompt)
        self.assertIn("mathematics",prompt)

    def test_remote_ai_consent_can_be_enabled_disabled_and_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"consent.db"
            try:
                main.init_db()
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="safe-test-password",consent_data=True))
                with main.connect() as db:participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                main.update_consent(main.ConsentInput(data=True,voice_storage=False,followup=True,remote_ai=True),participant)
                self.assertEqual(main.profile(participant)["consent_remote_ai"],1)
                main.update_consent(main.ConsentInput(data=True,voice_storage=False,followup=True),participant)
                self.assertEqual(main.profile(participant)["consent_remote_ai"],1)
                main.update_consent(main.ConsentInput(data=True,voice_storage=False,followup=True,remote_ai=False),participant)
                self.assertEqual(main.profile(participant)["consent_remote_ai"],0)
            finally:main.DB_PATH=original

    def test_unknown_assistant_questions_escalate_into_programme_support(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"assistant-support.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="TestPass123!long"))
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="TestPass123!long",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Digital Skills","Learn practical digital skills","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open to everyone","open",main.now())).lastrowid
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,registration["user"]["id"],"enrolled",main.now()))
                    session_start=(main.datetime.now(main.timezone.utc)+main.timedelta(days=10)).isoformat()
                    db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(programme_id,"Welcome session","live_online",session_start,(main.datetime.now(main.timezone.utc)+main.timedelta(days=10,hours=1)).isoformat(),"support-session-token"))
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                schedule=main.assistant_confirm(main.VoiceInput(text="When is my next class?",programme_id=programme_id,confirmed=True),participant)
                self.assertIn("Welcome session",schedule["assistant_text"])
                self.assertIn(session_start,schedule["assistant_text"])
                with patch.object(main,"ollama_answer",return_value=None):
                    result=main.assistant_confirm(main.VoiceInput(text="What is the Wi-Fi password?",programme_id=programme_id,confirmed=True),participant)
                self.assertEqual(result["status"],"escalated")
                self.assertEqual(result["programme_id"],programme_id)
                self.assertEqual(result["action"],"contact_staff")
                with main.connect() as db:
                    case=db.execute("SELECT * FROM followup_cases WHERE id=?",(result["case_id"],)).fetchone()
                    conversation=db.execute("SELECT * FROM conversations WHERE id=?",(result["conversation_id"],)).fetchone()
                    messages=db.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY id",(result["conversation_id"],)).fetchall()
                self.assertEqual(case["programme_id"],programme_id)
                self.assertEqual(conversation["kind"],"ai_followup")
                self.assertEqual(len(messages),4)
                self.assertEqual(messages[-2]["body"],"What is the Wi-Fi password?")
                self.assertEqual(messages[-2]["sender_id"],participant["id"])
                self.assertEqual(messages[-1]["ai"],1)
            finally:main.DB_PATH=original

    def test_case_visibility_and_replies_follow_programme_tenant_and_support_thread(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"case-routing.db"
            try:
                main.init_db()
                first=main.setup(main.SetupInput(organisation_name="First Org",organisation_type="NGO",name="First Admin",username="first@example.test",password="TestPass123!long"))
                second=main.setup(main.SetupInput(organisation_name="Second Org",organisation_type="NGO",name="Second Admin",username="second@example.test",password="TestPass123!long"))
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="TestPass123!long",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(first["user"]["organisation_id"],"First programme","","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid
                    other_programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(second["user"]["organisation_id"],"Second programme","","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid
                    participant_id=registration["user"]["id"]
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant_id,"enrolled",main.now()))
                    case_id=db.execute("INSERT INTO followup_cases(participant_id,programme_id,trigger_type,status,category,urgency,original_text,translation_en,summary,suggested_reply,created_at) VALUES(?,?,'participant_message','escalated','other','High','Help please','Help please','Needs staff','Reply here',?)",(participant_id,programme_id,main.now())).lastrowid
                    support_id=db.execute("INSERT INTO conversations(participant_id,kind,programme_id,created_at) VALUES(?,'ai_followup',?,?)",(participant_id,programme_id,main.now())).lastrowid
                    db.execute("INSERT INTO conversations(participant_id,kind,programme_id,created_at) VALUES(?,'direct',?,?)",(participant_id,programme_id,main.now()))
                    first_admin=db.execute("SELECT * FROM users WHERE id=?",(first["user"]["id"],)).fetchone()
                    second_admin=db.execute("SELECT * FROM users WHERE id=?",(second["user"]["id"],)).fetchone()
                self.assertEqual([row["id"] for row in main.cases(None,first_admin)],[case_id])
                self.assertEqual(main.cases(None,second_admin),[])
                asyncio.run(main.reply_case(case_id,main.CaseReply(body="Our team will contact you."),first_admin))
                with main.connect() as db:
                    support_messages=db.execute("SELECT body,sender_id FROM messages WHERE conversation_id=? ORDER BY id",(support_id,)).fetchall()
                    direct_messages=db.execute("SELECT id FROM messages WHERE conversation_id=(SELECT max(id) FROM conversations WHERE kind='direct')").fetchall()
                    status=db.execute("SELECT status FROM followup_cases WHERE id=?",(case_id,)).fetchone()["status"]
                self.assertEqual(support_messages[-1]["body"],"Our team will contact you.")
                self.assertEqual(support_messages[-1]["sender_id"],first_admin["id"])
                self.assertEqual(direct_messages,[])
                self.assertEqual(status,"closed")
                self.assertNotEqual(programme_id,other_programme_id)
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(main.reply_case(case_id,main.CaseReply(body="Wrong tenant"),second_admin))
                self.assertEqual(raised.exception.status_code,404)
            finally:main.DB_PATH=original

    def test_database_upgrade_only_attaches_unambiguous_legacy_support_records(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"legacy-support.db"
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="TestPass123!long"))
                single=main.register(main.RegisterInput(name="Single programme",username="single@example.test",password="TestPass123!long",consent_data=True))
                multiple=main.register(main.RegisterInput(name="Multiple programmes",username="multiple@example.test",password="TestPass123!long",consent_data=True))
                with main.connect() as db:
                    programme_ids=[db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],f"Programme {index}","","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open","open",main.now())).lastrowid for index in range(2)]
                    single_id=single["user"]["id"];multiple_id=multiple["user"]["id"]
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_ids[0],single_id,"enrolled",main.now()))
                    for programme_id in programme_ids:db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,multiple_id,"enrolled",main.now()))
                    single_case=db.execute("INSERT INTO followup_cases(participant_id,trigger_type,status,category,urgency,original_text,translation_en,summary,suggested_reply,created_at) VALUES(?,'participant_message','escalated','other','High','Help','Help','Needs staff','Reply',?)",(single_id,main.now())).lastrowid
                    multiple_case=db.execute("INSERT INTO followup_cases(participant_id,trigger_type,status,category,urgency,original_text,translation_en,summary,suggested_reply,created_at) VALUES(?,'participant_message','escalated','other','High','Help','Help','Needs staff','Reply',?)",(multiple_id,main.now())).lastrowid
                    legacy_conversation=db.execute("INSERT INTO conversations(participant_id,kind,created_at) VALUES(?,'ai_followup',?)",(single_id,main.now())).lastrowid
                main.init_db()
                with main.connect() as db:
                    self.assertEqual(db.execute("SELECT programme_id FROM followup_cases WHERE id=?",(single_case,)).fetchone()["programme_id"],programme_ids[0])
                    self.assertIsNone(db.execute("SELECT programme_id FROM followup_cases WHERE id=?",(multiple_case,)).fetchone()["programme_id"])
                    self.assertEqual(db.execute("SELECT programme_id FROM conversations WHERE id=?",(legacy_conversation,)).fetchone()["programme_id"],programme_ids[0])
            finally:main.DB_PATH=original

    def test_participants_cannot_access_sessions_until_approved(self):
        with tempfile.TemporaryDirectory() as directory:
            original_db,original_uploads=main.DB_PATH,main.UPLOAD_DIR
            original_storage=main.MEDIA_STORAGE
            main.DB_PATH=Path(directory)/"programme-schedule.db"
            main.UPLOAD_DIR=Path(directory)/"uploads"
            main.UPLOAD_DIR.mkdir()
            objects={}

            class FakeS3:
                def upload_file(self,filename,bucket,key):
                    objects[(bucket,key)]=Path(filename).read_bytes()

                def download_file(self,bucket,key,filename):
                    Path(filename).write_bytes(objects[(bucket,key)])

                def delete_object(self,*,Bucket,Key):
                    objects.pop((Bucket,Key),None)

            main.MEDIA_STORAGE=MediaStorage("test-bucket",FakeS3())
            try:
                main.init_db()
                organisation=main.setup(main.SetupInput(organisation_name="Skills Hub",organisation_type="NGO",name="Admin",username="admin@example.test",password="Organiser-test-123"))
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="Participant-test-123",consent_data=True))
                with main.connect() as db:
                    organiser=db.execute("SELECT * FROM users WHERE id=?",(organisation["user"]["id"],)).fetchone()
                    participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                programme=main.create_programme(main.ProgrammeInput(title="Digital Skills",description="Learn practical digital skills",category="Training",format="Online",location="Lagos",start_date="2026-11-01",end_date="2026-11-30",capacity=20,eligibility="Open to everyone",status="open",activity_type="event",sessions=[main.SessionInput(title="Welcome session",kind="live_online",scheduled_start="2026-11-02T10:00:00+00:00",scheduled_end="2026-11-02T11:00:00+00:00")]),organiser)
                self.assertEqual(programme["activity_type"],"event")
                unchanged_type=main.update_programme(programme["id"],main.ProgrammeInput(title="Updated event",start_date="2026-11-01",end_date="2026-11-30"),organiser)
                self.assertEqual(unchanged_type["activity_type"],"event")
                schedule=main.participant_sessions(participant)
                self.assertEqual(schedule,[])
                with self.assertRaises(HTTPException) as raised:main.sessions(programme["id"],participant)
                self.assertEqual(raised.exception.status_code,403)
                application=main.apply(programme["id"],participant)
                self.assertEqual(application["status"],"applied")
                self.assertEqual(main.participant_sessions(participant),[])
                with main.connect() as db:
                    enrolment=db.execute("SELECT id FROM enrolments WHERE programme_id=? AND participant_id=?",(programme["id"],participant["id"])).fetchone()
                main.decision(enrolment["id"],main.DecisionInput(status="enrolled"),organiser)
                schedule=main.participant_sessions(participant)
                self.assertEqual(len(schedule),1)
                self.assertEqual(schedule[0]["title"],"Welcome session")
                self.assertNotIn("qr_token",schedule[0])
                with main.connect() as db:
                    closed_programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(organisation["user"]["organisation_id"],"Draft programme","","Training","Online","Lagos","2026-11-01","2026-11-30",20,"Open","draft",main.now())).lastrowid
                    db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,qr_token) VALUES(?,?,?,?,?,?)",(closed_programme_id,"Private draft session","live_online","2026-11-03T10:00:00+00:00","2026-11-03T11:00:00+00:00","private-qr-token"))
                self.assertEqual(len(main.participant_sessions(participant)),1)
                with self.assertRaises(HTTPException) as raised:
                    main.create_programme(main.ProgrammeInput(title="Invalid dates",start_date="2026-11-01",end_date="2026-11-30",sessions=[main.SessionInput(title="Outside programme",scheduled_start="2026-12-02T10:00:00+00:00",scheduled_end="2026-12-02T11:00:00+00:00")]),organiser)
                self.assertEqual(raised.exception.status_code,422)
                upload=UploadFile(filename="cover.png",file=io.BytesIO(b"\x89PNG\r\n\x1a\nimage-data"),headers=Headers({"content-type":"image/png"}))
                asyncio.run(main.upload_programme_image(programme["id"],upload,organiser))
                with main.connect() as db:stored=db.execute("SELECT image_filename FROM programmes WHERE id=?",(programme["id"],)).fetchone()
                stored_path=main.UPLOAD_DIR/stored["image_filename"]
                self.assertTrue(stored_path.is_file())
                self.assertIn(("test-bucket",f"uploads/{stored['image_filename']}"),objects)
                stored_path.unlink()
                response=main.programme_image(programme["id"],participant)
                self.assertEqual(response.media_type,"image/png")
                self.assertEqual(Path(response.path).read_bytes(),b"\x89PNG\r\n\x1a\nimage-data")
                invalid=UploadFile(filename="cover.svg",file=io.BytesIO(b"<svg></svg>"),headers=Headers({"content-type":"image/svg+xml"}))
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(main.upload_programme_image(programme["id"],invalid,organiser))
                self.assertEqual(raised.exception.status_code,415)
            finally:
                main.DB_PATH,main.UPLOAD_DIR=original_db,original_uploads
                main.MEDIA_STORAGE=original_storage

    def test_browser_codec_mime_voice_upload_reaches_transcriber(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"voice.db"
            try:
                main.init_db()
                registration=main.register(main.RegisterInput(name="Member",username="member@example.test",password="member-password",consent_data=True))
                with main.connect() as db:participant=db.execute("SELECT * FROM users WHERE id=?",(registration["user"]["id"],)).fetchone()
                upload=UploadFile(filename="voice.webm",file=io.BytesIO(b"recorded audio"),headers=Headers({"content-type":"audio/webm;codecs=opus"}))
                with patch("backend.ai.voice.transcribe_and_translate",side_effect=RuntimeError("model missing")):
                    with self.assertRaises(HTTPException) as raised:
                        asyncio.run(main.transcribe_voice(upload,"English",participant))
                self.assertEqual(raised.exception.status_code,503)
                self.assertIn("model missing",raised.exception.detail)
            finally:main.DB_PATH=original

    def test_recording_without_quiz_records_attendance(self):
        with tempfile.TemporaryDirectory() as directory:
            original=main.DB_PATH
            main.DB_PATH=Path(directory)/"recording.db"
            try:
                main.init_db()
                setup=main.setup(main.SetupInput(organisation_name="Test Organisation",organisation_type="NGO",name="Organiser",username="organiser@example.test",password="organiser-password"))
                registration=main.register(main.RegisterInput(name="Participant",username="person@example.test",password="participant-password",consent_data=True))
                with main.connect() as db:
                    programme_id=db.execute("INSERT INTO programmes(organisation_id,title,description,category,format,location,start_date,end_date,capacity,eligibility,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",(setup["user"]["organisation_id"],"Test programme","","Training","Online","Remote","2026-10-01","2026-10-31",20,"Open","open",main.now())).lastrowid
                    session_id=db.execute("INSERT INTO sessions(programme_id,title,kind,scheduled_start,scheduled_end,recording_file,deadline_days,quiz_json,qr_token) VALUES(?,?,?,?,?,?,?,?,?)",(programme_id,"Recorded session","recording","2026-10-01T10:00:00+00:00","2026-10-01T11:00:00+00:00","recordings/test.mp4",7,"[]","test-token")).lastrowid
                    participant_id=registration["user"]["id"]
                    db.execute("INSERT INTO enrolments(programme_id,participant_id,status,enrolled_at) VALUES(?,?,?,?)",(programme_id,participant_id,"enrolled",main.now()))
                    db.execute("INSERT INTO watch_progress(session_id,participant_id,segments,position,valid_seconds,duration_seconds,started_at) VALUES(?,?,?,0,0,100,?)",(session_id,participant_id,"[]","2000-01-01T00:00:00+00:00"))
                    participant=db.execute("SELECT * FROM users WHERE id=?",(participant_id,)).fetchone()
                result=main.update_progress(session_id,main.ProgressInput(segments=[[0,70]],position=70,duration_seconds=100),participant)
                self.assertTrue(result["completed"])
                self.assertFalse(result["quiz_unlocked"])
                with main.connect() as db:
                    attendance=db.execute("SELECT mode,percent FROM attendance WHERE session_id=? AND participant_id=?",(session_id,participant_id)).fetchone()
                self.assertEqual(attendance["mode"],"recording")
                self.assertEqual(attendance["percent"],70)
            finally:main.DB_PATH=original


if __name__=="__main__":unittest.main()
