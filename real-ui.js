let selectedProgrammeId = null;
let selectedSessionId = null;
let selectedConversationId = null;
let messageView = 'inbox';
let organisationMessagesTab = 'chats';
let messageLoadSequence = 0;
let messagePollInFlight = false;
let messagesSection = 'chats';
let selectedGroupProgrammeId = null;
let groupLoadSequence = 0;
let groupPollInFlight = false;
let peopleSection = 'participants';
let selectedGroupMemberProfile = null;
let programmeSyncInFlight = false;
let organisationSyncInFlight = false;
let programmeImageLoadSequence = 0;
let programmeSessionQuery = '';
let programmeReviewData = {};
let reportProgrammeFilter = 'all';
let organisationGalleryAlbums = [];
let organisationGalleryError = '';
let organisationGalleryLoading = false;
let publicGallery = null;
let publicGalleryError = '';
let activeGalleryAlbum = null;
let activeGalleryMediaIndex = 0;
let galleryCommentDraft = '';
let galleryCoverRotationTimer = null;
let reportSection = 'overview';
const programmeImageUrls = new Set();
let accountImageLoadSequence = 0;
const accountImageUrls = new Set();
let lastConversationSync = 0;
let guideIndex = 0;
let authView = location.pathname.startsWith('/organisations/') ? 'guest' : 'landing';
let authRole = 'organiser';
let authIntent = 'login';
let ownerAccessSequence = '';
let authProviders = {google:false,email_delivery:false,email_verification:false};
let pendingAuthEmail = '';
const authRedirectUrl=new URL(location.href);
const authRedirectParams=new URLSearchParams(authRedirectUrl.hash.slice(1));
let pendingVerificationToken=authRedirectParams.get('verify_email')||authRedirectUrl.searchParams.get('verify_email')||'';
let passwordResetToken=authRedirectParams.get('password_reset')||authRedirectUrl.searchParams.get('password_reset')||'';
let googleCompletionCode=authRedirectParams.get('google_code')||authRedirectUrl.searchParams.get('google_code')||'';
let googleAuthError=authRedirectParams.get('google_error')||authRedirectUrl.searchParams.get('google_error')||'';
if(pendingVerificationToken)authView='verify';
if(passwordResetToken)authView='reset';
if(pendingVerificationToken||passwordResetToken||googleCompletionCode||googleAuthError)history.replaceState({},document.title,location.pathname+location.search);
let discoverSection = 'programmes';
let selectedOrganisationId = null;
let activeOrganisationAiId = null;
let selectedSupportOrganisationId = null;
let organisationProgrammeSection='active';
let discoverFilters = {category:'all',format:'all',location:'all',availability:'all',status:'all'};
let pendingSupportKind = 'assistant';
const organiserPages = ['Dashboard','Programmes','Participants','Follow-Up','Messages','Reports','Gallery','Settings'];

function passwordField(id,label,autocomplete,minLength=0){
  return `<div class="field"><label for="${id}">${label}</label><div class="password-input-wrap"><input id="${id}" type="password" autocomplete="${autocomplete}" required ${minLength?`minlength="${minLength}"`:''}><button type="button" class="password-visibility" aria-label="Show ${label.toLowerCase()}" aria-pressed="false" onclick="togglePasswordVisibility('${id}',this)">${passwordEyeIcon(false)}</button></div></div>`;
}
function passwordEyeIcon(showing){return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${showing?'<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A11.4 11.4 0 0 1 12 5c5 0 8.5 4 9.5 7-.4 1.1-1.2 2.2-2.3 3.2"/><path d="M6.6 6.6C4.4 7.8 3 9.6 2.5 12c.7 2.2 3.7 7 9.5 7 1.4 0 2.7-.3 3.8-.9"/>':'<path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>'}</svg>`;}
function googleButton(intent){return `<button type="button" class="google-auth-button" onclick="startGoogleAuth('${intent}')"><span class="google-mark" aria-hidden="true">G</span> Continue with Google</button>`;}
function togglePasswordVisibility(id,button){
  const input=document.getElementById(id);if(!input)return;
  const showing=input.type==='password';input.type=showing?'text':'password';
  const label=input.closest('.field')?.querySelector('label')?.textContent?.toLowerCase()||'password';
  button.setAttribute('aria-label',`${showing?'Hide':'Show'} ${label}`);
  button.setAttribute('aria-pressed',String(showing));button.innerHTML=passwordEyeIcon(showing);
}
function showPasswordReset(){pendingAuthEmail=$('#login-email')?.value.trim()||'';authView='forgot';render();}
async function requestPasswordResetForm(event){
  event.preventDefault();try{const result=await api('/api/auth/password-reset/request',{method:'POST',body:JSON.stringify({email:$('#reset-request-email').value.trim()})});toast(result.message);chooseAuth(authRole,'login');}catch(error){toast(error.message||'Could not request a password reset.');}
}
async function completePasswordResetForm(event){
  event.preventDefault();const password=$('#new-password').value;
  if(password!==$('#confirm-password').value)return toast('The passwords do not match.');
  try{const result=await api('/api/auth/password-reset/complete',{method:'POST',body:JSON.stringify({token:passwordResetToken,password})});passwordResetToken='';authView='login';render();toast(result.message);}catch(error){toast(error.message||'Could not update your password.');}
}
async function verifyEmail(){
  try{await api('/api/auth/verify-email',{method:'POST',body:JSON.stringify({token:pendingVerificationToken})});pendingVerificationToken='';authView='login';render();toast('Your email is verified. You can now sign in.');}
  catch(error){toast(error.message||'This verification link is invalid or expired.');}
}
async function resendVerification(){
  const input=$('#resend-email');if(input&&!input.checkValidity()){input.reportValidity();return;}
  const email=input?.value.trim()||pendingAuthEmail;if(!email)return toast('Enter your email address.');
  try{const result=await api('/api/auth/resend-verification',{method:'POST',body:JSON.stringify({email})});toast(result.message);}
  catch(error){toast(error.message||'Could not resend the verification email.');}
}
async function startGoogleAuth(intent){
  const selectedRole=authRole==='organiser'?'organiser':'participant';
  const registration={role:selectedRole,intent};
  if(intent==='signup'&&selectedRole==='participant'){
    registration.name=$('#register-name')?.value.trim()||'';
    registration.language=$('#register-language')?.value||'English';
    registration.area=$('#register-area')?.value.trim()||'';
    registration.consent_data=$('#register-data')?.checked||false;
    registration.consent_voice=$('#register-voice')?.checked||false;
    registration.consent_followup=$('#register-followup')?.checked!==false;
    if(registration.name.length<2)return toast('Enter your name before continuing with Google.');
    if(!registration.consent_data)return toast('Consent to programme services is required to create an account.');
  }else if(intent==='signup'){
    registration.name=$('#setup-name')?.value.trim()||'';
    registration.organisation_name=$('#setup-org')?.value.trim()||'';
    registration.organisation_type=$('#setup-type')?.value||'NGO';
    if(registration.name.length<2||registration.organisation_name.length<2)return toast('Enter your name and organisation name before continuing with Google.');
  }
  sessionStorage.setItem('voxera-google-registration',JSON.stringify(registration));
  location.assign(window.voxeraApiUrl(`/api/auth/google/start?role=${encodeURIComponent(selectedRole)}&intent=${encodeURIComponent(intent)}`));
}
async function initializeAuthExperience(){
  try{authProviders=await api('/api/auth/providers');}catch(error){console.warn('Authentication provider settings are unavailable:',error.message);}
  renderReal();
  if(googleAuthError){googleAuthError='';toast('Google sign-in was not completed. Please try again.');}
  if(googleCompletionCode){
    const code=googleCompletionCode;googleCompletionCode='';
    let registration={role:'participant',intent:'signin'};
    try{registration=JSON.parse(sessionStorage.getItem('voxera-google-registration')||'{}');}catch{}
    sessionStorage.removeItem('voxera-google-registration');
    try{
      const result=await api('/api/auth/google/complete',{method:'POST',body:JSON.stringify({code,...registration})});
      saveLogin(result);setupRequired=false;await hydrate();render();if(registration.intent==='signup')showGuide(true);
    }catch(error){authRole=registration.role==='organiser'?'organiser':'participant';authView='login';render();toast(error.message||'Google sign-in failed.');}
  }
}

function setupPage(){
  const signUpAction=authRole==='participant'?"chooseAuth('participant','register')":'openOrgSetup()';
  const signUpText=authRole==='participant'?'Create participant account':'Create organisation account';
  if(setupRequired===null)return '<div class="login-shell"><div class="login-card"><span class="brand"><span class="brandmark">v</span> voxera</span><p>Checking your local workspace…</p></div></div>';
  if(authView==='choose')return `<div class="login-shell"><div class="login-card auth-choice"><button type="button" class="text-link auth-back" onclick="backToLanding()">← Back to landing page</button><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:20px">YOUR VOXERA JOURNEY</div><h1 class="page-title">${authIntent==='signup'?'Sign up':'Log in'} to Voxera</h1><p class="page-subtitle">Choose how you want to ${authIntent==='signup'?'join':'access'} Voxera.</p><button class="auth-option" onclick="chooseAuth('participant',authIntent==='signup'?'register':'login')"><span><b>Participant</b><small>${authIntent==='signup'?'Create an account to explore activities and follow your journey.':'Log in to your participant account.'}</small></span><span>→</span></button><button class="auth-option" onclick="chooseAuth('organiser',authIntent==='signup'?'setup':'login')"><span><b>Organisation</b><small>${authIntent==='signup'?'Create an organisation workspace and welcome participants.':'Log in to your organisation workspace.'}</small></span><span>→</span></button></div></div>`;
  if(authView==='verify')return `<div class="login-shell"><div class="login-card"><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:24px">EMAIL VERIFICATION</div><h1 class="page-title">${pendingVerificationToken?'Verify your email':'Check your inbox'}</h1><p class="page-subtitle">${pendingVerificationToken?'Confirm this email address to finish setting up your Voxera account.':'Verify the email address on your account before signing in. Open the verification link from Voxera, then return here.'}</p>${pendingVerificationToken?'<button class="btn btn-primary" style="width:100%" onclick="verifyEmail()">Verify email address</button>':''}${authProviders.email_delivery?`<div class="field" style="margin-top:18px"><label>Email address</label><input id="resend-email" type="email" value="${esc(pendingAuthEmail)}" autocomplete="email" required></div><button class="btn btn-outline" style="width:100%" onclick="resendVerification()">Resend verification email</button>`:''}<p class="row-meta" style="text-align:center;margin-top:16px"><button type="button" class="text-link" onclick="chooseAuth('${authRole==='organiser'?'organiser':'participant'}','login')">Return to sign in</button></p></div></div>`;
  if(authView==='forgot')return `<div class="login-shell"><form class="login-card" onsubmit="requestPasswordResetForm(event)"><button type="button" class="text-link auth-back" onclick="chooseAuth(authRole,'login')">← Back to sign in</button><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:24px">PASSWORD RESET</div><h1 class="page-title">Forgot your password?</h1><p class="page-subtitle">Enter your account email and we’ll send a reset link if it belongs to a verified account.</p><div class="field"><label>Email</label><input id="reset-request-email" type="email" value="${esc(pendingAuthEmail)}" autocomplete="email" required></div><button class="btn btn-primary" style="width:100%">Send reset link</button></form></div>`;
  if(authView==='reset')return `<div class="login-shell"><form class="login-card" onsubmit="completePasswordResetForm(event)"><button type="button" class="text-link auth-back" onclick="chooseAuth(authRole,'login')">← Back to sign in</button><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:24px">PASSWORD RESET</div><h1 class="page-title">Choose a new password</h1><p class="page-subtitle">Use at least 10 characters, then enter it again to confirm.</p>${passwordField('new-password','New password','new-password',10)}${passwordField('confirm-password','Confirm new password','new-password',10)}<button class="btn btn-primary" style="width:100%">Update password</button></form></div>`;
  if(authView==='setup')return organisationSignupPage();
  if(authView==='register')return participantSignupPage();
  return `<div class="login-shell"><form class="login-card" onsubmit="loginForm(event)"><button type="button" class="text-link auth-back" onclick="backToAuth()">← Choose another role</button><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:24px">${authRole==='platform_owner'?'PLATFORM OWNER':authRole==='participant'?'PARTICIPANT':'ORGANISATION'} · SIGN IN</div><h1 class="page-title">${authRole==='platform_owner'?'Owner control panel':'Welcome back'}</h1><p class="page-subtitle">${authRole==='platform_owner'?'Sign in with the owner credentials provisioned on this server.':'Sign in to your '+(authRole==='participant'?'participant account':'organisation workspace')+'.'}</p><div class="field"><label>Email</label><input id="login-email" name="username" type="email" autocomplete="username" required></div>${passwordField('login-password','Password','current-password')}<button class="btn btn-primary" style="width:100%">Sign in</button>${authRole!=='platform_owner'&&authProviders.email_delivery?'<button type="button" class="text-link auth-reset-link" onclick="showPasswordReset()">Forgot password?</button>':''}${authRole!=='platform_owner'&&authProviders.google?googleButton('signin'):''}${authRole==='platform_owner'?'<div class="row-meta" style="text-align:center;margin-top:15px">Owner credentials are created locally by the server operator.</div>':`<div class="row-meta" style="text-align:center;margin-top:15px">${authRole==='participant'?'New to Voxera?':'First time setting up this installation?'} <button type="button" class="text-link" onclick="${signUpAction}">${signUpText}</button></div>`}</form></div>`;
}
const setupPageBeforeGuestBrowse=setupPage;
setupPage=function(){
  return setupPageBeforeGuestBrowse().replace(
    'PROGRAMMES THAT REACH EVERYONE',
    'OPPORTUNITIES THAT REACH EVERYONE'
  ).replace('Discover programmes and track your learning','Explore activities and track your progress');
};
const stockPhoto=(id,width=1600)=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
function landingPage(){
  const photos={
    community:stockPhoto('photo-1531206715517-5c0ba140b2b8',1900),
    learning:stockPhoto('photo-1509062522246-3755977927d7',1200),
    people:stockPhoto('photo-1529156069898-49953e39b3ac',1200),
    workshop:stockPhoto('photo-1556761175-b413da4baf72',1200),
    mentor:stockPhoto('photo-1521737711867-e3b97375f902',1000),
    ai:stockPhoto('photo-1505373877841-8d25f7d46678',1200),
    closing:stockPhoto('photo-1511632765486-a01980e01a18',1500)
  };
  return `<main class="voxera-landing">
    <header class="landing-nav"><a class="landing-brand" href="/" aria-label="Voxera home"><span class="landing-mark">v</span><span>voxera</span></a><nav class="landing-links" aria-label="Main navigation"><a href="#our-story" onclick="closeLandingMenu()">Our story</a><a href="#how-it-works" onclick="closeLandingMenu()">What Voxera offers</a><a href="#ai-at-voxera" onclick="closeLandingMenu()">AI with care</a></nav><div class="landing-nav-actions"><button class="landing-text-action" onclick="openAuthChoice('signup')">Sign up</button><button class="landing-nav-join" onclick="openAuthChoice('login')">Log in <span aria-hidden="true">↗</span></button></div><button class="landing-menu-toggle" aria-label="Open navigation" aria-expanded="false" onclick="toggleLandingMenu(this)"><span></span><span></span></button></header>
    <section class="landing-hero" aria-labelledby="landing-title">
      <img class="landing-hero-photo" src="${photos.community}" alt="Community members coming together around a shared table" fetchpriority="high">
      <div class="landing-hero-shade"></div>
      <div class="landing-hero-content"><span class="landing-kicker"><i></i> A place for people making a difference</span><h1 id="landing-title">Good work deserves<br><em>to go further.</em></h1><p>Voxera brings communities, organisers, and opportunities closer—so learning and local action can reach more people.</p><div class="landing-hero-actions"><button class="landing-cta landing-cta-light" onclick="openGuestExplore()">Browse activities <span aria-hidden="true">↗</span></button><button class="landing-cta landing-cta-glass" onclick="openAuthChoice('signup')">Sign up</button></div><div class="landing-trust-line"><span class="landing-avatar-stack" aria-hidden="true"><i>V</i><i>O</i><i>+</i></span><span>For the people building stronger communities</span></div></div>
      <div class="landing-hero-caption"><span>01 / 05</span><span>Learning · Community · Possibility</span></div>
      <div class="landing-scroll-cue"><span></span>Scroll to explore</div>
    </section>
    <section class="landing-intro landing-section" id="our-story" data-depth-section><div class="landing-intro-copy"><span class="landing-eyebrow">A PLATFORM WITH PEOPLE AT ITS HEART</span><h2>Progress happens<br>when <em>we move together.</em></h2><p>Across neighbourhoods, schools, nonprofits, and local organisations, people are already creating change. Voxera gives that work a home—making it easier to share opportunities, bring people in, and stay connected along the way.</p><button class="landing-inline-action" onclick="openAuthChoice('signup')">Sign up <span>↗</span></button></div><div class="landing-depth-scene"><div class="landing-photo-plane landing-photo-plane-back"><img src="${photos.learning}" alt="Learners taking part in a classroom session" loading="lazy"></div><div class="landing-photo-plane landing-photo-plane-front"><img src="${photos.people}" alt="Friends and neighbours spending time together outdoors" loading="lazy"></div><div class="landing-scene-note"><span class="landing-note-symbol">✳</span><span>Every community<br>has a story worth sharing.</span></div></div></section>
    <section class="landing-values landing-section" id="mission" data-depth-section><div class="landing-values-heading"><span class="landing-eyebrow">OUR NORTH STAR</span><h2>Built around a simple belief.</h2></div><div class="landing-value-grid"><article class="landing-value-card"><span class="landing-value-index">01</span><span class="landing-value-icon">◌</span><h3>Our vision</h3><p>A world where everyone can discover a meaningful opportunity to learn, participate, and shape their future.</p></article><article class="landing-value-card landing-value-card-featured"><span class="landing-value-index">02</span><span class="landing-value-icon">✳</span><h3>Our mission</h3><p>To help community organisations reach people, deliver better programmes, and understand the difference their work makes.</p></article><article class="landing-value-card"><span class="landing-value-index">03</span><span class="landing-value-icon">⌁</span><h3>Our promise</h3><p>Technology should make human connection easier—not replace the care, judgement, and trust it depends on.</p></article></div></section>
    <section class="landing-offers landing-section" id="how-it-works" data-depth-section><div class="landing-offers-head"><div><span class="landing-eyebrow">ONE SHARED SPACE</span><h2>From first hello<br>to lasting impact.</h2></div><p>Everything you need to bring an opportunity to life, in one thoughtful place.</p></div><div class="landing-offer-feature"><div class="landing-offer-photo"><img src="${photos.workshop}" alt="A team planning a community workshop together" loading="lazy"><span class="landing-photo-label">Ideas become action</span></div><div class="landing-offer-copy"><span class="landing-offer-number">01 — FOR ORGANISATIONS</span><h3>Make good work easier to find, run, and grow.</h3><ul><li>Publish programmes, events, campaigns, and services.</li><li>Welcome participants and manage applications in one workspace.</li><li>Schedule sessions, share recordings, and follow up with care.</li><li>See attendance, progress, and outcomes as your work grows.</li></ul><button class="landing-cta landing-cta-dark" onclick="openAuthChoice('signup')">Sign up <span>↗</span></button></div></div><div class="landing-participant-band"><div class="landing-participant-copy"><span class="landing-offer-number">02 — FOR PARTICIPANTS</span><h3>Find your next step.<br>Keep moving forward.</h3><p>Explore opportunities, apply, connect with your programme team, and keep track of your learning journey.</p><button class="landing-cta landing-cta-light" onclick="openGuestExplore()">Browse activities <span>↗</span></button><button class="landing-quiet-link" onclick="openAuthChoice('signup')">Sign up</button></div><div class="landing-participant-photo"><img src="${photos.mentor}" alt="A small team sharing ideas and supporting one another" loading="lazy"><span class="landing-floating-note"><i>✳</i><span>Your next opportunity<br>could start here.</span></span></div></div></section>
    <section class="landing-ai landing-section" id="ai-at-voxera" data-depth-section><div class="landing-ai-scene"><img src="${photos.ai}" alt="People working together and listening to one another" loading="lazy"><div class="landing-ai-orbit landing-ai-orbit-one"></div><div class="landing-ai-orbit landing-ai-orbit-two"></div><div class="landing-ai-glass-card"><span class="landing-ai-spark">✳</span><span><b>Support that meets people where they are.</b><small>Voice · Language · Human connection</small></span></div></div><div class="landing-ai-copy"><span class="landing-eyebrow">AI, WITH PEOPLE IN MIND</span><h2>A more welcoming way<br>to get support.</h2><p>Voxera’s assistant can help participants explore opportunities, ask questions, and find their way through a programme. Voice and language tools can make help easier to access.</p><div class="landing-ai-points"><div><span>01</span><p><b>Ask in your own way</b><br>Use supported voice or chat options to ask about opportunities.</p></div><div><span>02</span><p><b>Understand what comes next</b><br>Get clear guidance on applications, sessions, and participation.</p></div><div><span>03</span><p><b>People stay in the loop</b><br>Sensitive or uncertain conversations can be brought to the programme team.</p></div></div><p class="landing-ai-note">AI support depends on the services enabled by each Voxera deployment. Human support remains part of the journey.</p></div></section>
    <section class="landing-final-cta"><img src="${photos.closing}" alt="" loading="lazy"><div class="landing-final-shade"></div><div class="landing-final-copy"><span class="landing-eyebrow">YOUR COMMUNITY. YOUR NEXT CHAPTER.</span><h2>There’s room for<br>more good things.</h2><p>Find an activity that speaks to you, or bring your organisation’s work to the people it can reach.</p><div class="landing-hero-actions"><button class="landing-cta landing-cta-light" onclick="openGuestExplore()">Browse activities <span>↗</span></button><button class="landing-cta landing-cta-glass" onclick="openAuthChoice('signup')">Sign up</button></div><div class="landing-final-signin"><span>Already with Voxera?</span><button onclick="openAuthChoice('login')">Log in</button></div></div></section>
    <footer class="landing-footer"><a class="landing-brand" href="/" aria-label="Voxera home"><span class="landing-mark">v</span><span>voxera</span></a><span>Making room for people and possibilities.</span><button onclick="openGuestExplore()">Browse activities ↗</button></footer>
  </main>`;
}
function toggleLandingMenu(button){
  const nav=document.querySelector('.landing-nav');
  const open=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav?.classList.toggle('landing-menu-open',open);
}
function closeLandingMenu(){
  const nav=document.querySelector('.landing-nav');
  const button=document.querySelector('.landing-menu-toggle');
  nav?.classList.remove('landing-menu-open');
  button?.setAttribute('aria-expanded','false');
  button?.setAttribute('aria-label','Open navigation');
}
function prepareLandingMotion(){
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections=[...document.querySelectorAll('[data-depth-section]')];
  if(!sections.length)return;
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-in-view',entry.isIntersecting)),{threshold:0.12});
  sections.forEach(section=>observer.observe(section));
  const hero=document.querySelector('.landing-hero');
  if(!hero||reduceMotion)return;
  let queued=false;
  const updateDepth=()=>{
    hero.style.setProperty('--hero-scroll-depth',Math.min(1,Math.max(0,window.scrollY/Math.max(1,hero.offsetHeight))));
    sections.forEach(section=>{
      const bounds=section.getBoundingClientRect();
      const center=bounds.top+bounds.height/2;
      const depth=Math.max(-1,Math.min(1,(window.innerHeight/2-center)/Math.max(1,window.innerHeight)));
      section.style.setProperty('--scene-depth',depth.toFixed(3));
    });
    queued=false;
  };
  window.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(updateDepth);}},{passive:true});
  updateDepth();
}
const participantSignupBeforeCommunityCopy=participantSignupPage;
participantSignupPage=function(){
  return participantSignupBeforeCommunityCopy().replace('Create an account to discover and apply to programmes.','Create an account to explore and apply to community activities.').replace('I agree that Voxera may use my information to provide programme services.','I agree that Voxera may use my information to provide community services.');
};
async function openGuestExplore(){
  if(location.pathname.startsWith('/organisations/'))history.replaceState({},'','/');
  authView='guest';state.publicOrganisation=null;state.publicActivities=null;state.publicActivityError='';state.publicActivityOffset=0;state.publicActivityLoading=false;
  renderReal();
  try{state.publicActivities=await api('/api/public/activities?limit=50&offset=0');renderReal();}
  catch(error){state.publicActivityError=error.message;renderReal();}
}
async function openGuestOrganisation(slug,updateUrl=true){
  if(!slug)return;
  authView='guest';state.publicOrganisation=null;state.publicOrgError='';
  if(updateUrl)history.pushState({},'',`/organisations/${encodeURIComponent(slug)}`);
  renderReal();
  try{state.publicOrganisation=await api(`/api/public/organisations/${encodeURIComponent(slug)}`);await loadPublicGallery(slug);}
  catch(error){state.publicOrgError=error.message;renderReal();}
}
function closeGuestOrganisation(){
  state.publicOrganisation=null;state.publicOrgError='';
  if(location.pathname.startsWith('/organisations/'))history.replaceState({},'','/');
  renderReal();
  if(!state.publicActivities)openGuestExplore();
}
async function loadMorePublicActivities(){
  if(state.publicActivityLoading)return;
  state.publicActivityLoading=true;
  const nextOffset=(state.publicActivities||[]).length;
  try{
    const rows=await api(`/api/public/activities?limit=50&offset=${nextOffset}`);
    state.publicActivities=[...(state.publicActivities||[]),...rows];
    state.publicActivityOffset=nextOffset;
  }catch(error){state.publicActivityError=error.message;}
  finally{state.publicActivityLoading=false;renderReal();}
}
function publicEnrollmentLabel(activity){
  return activity.enrolled_count===null||activity.enrolled_count===undefined?'':`<span class="badge">${Number(activity.enrolled_count)} enrolled</span>`;
}
function guestExplorePage(){
  if(state.publicOrganisation)return guestOrganisationPage();
  if(location.pathname.startsWith('/organisations/'))return `<main class="public-shell"><header class="topbar"><a class="brand" href="/" onclick="closeGuestOrganisation();return false"><span class="brandmark">v</span> voxera</a></header>${state.publicOrgError?`<div class="notice" role="alert">${esc(state.publicOrgError)}</div>`:'<p role="status">Loading organisation page…</p>'}<button class="btn btn-outline" onclick="closeGuestOrganisation()">← Explore activities</button></main>`;
  const activities=state.publicActivities||[];
  const types=[...new Set(activities.map(item=>item.activity_type||'programme'))];
  const photos={
    hero:stockPhoto('photo-1492684223066-81342ee5ff30',1900),
    community:stockPhoto('photo-1517245386807-bb43f82c33c4',1400)
  };
  const cards=activities.map(item=>`<article class="card guest-activity-card" data-type="${esc(item.activity_type||'programme')}" data-search="${esc(`${item.title} ${item.description} ${item.category} ${item.location} ${item.organisation_name}`.toLowerCase())}"><span class="badge">${esc(item.activity_type||'programme')}</span>${publicEnrollmentLabel(item)}<h2 class="card-title">${esc(item.title)}</h2><p>${esc(item.description||'')}</p><div class="row-meta">${esc(item.category)} · ${esc(item.format)} · ${esc(item.location)}<br>${esc(item.organisation_name)} · ${dateLabel(item.start_date)} – ${dateLabel(item.end_date)}</div><button class="text-link" onclick="openGuestOrganisation('${esc(item.organisation_slug)}')">View organisation <span aria-hidden="true">↗</span></button><br><button class="btn btn-primary btn-small" onclick="openAuthChoice('signup')">Sign up to apply</button></article>`).join('');
  const loadMore=activities.length>0&&activities.length%50===0?`<button class="btn btn-outline" onclick="loadMorePublicActivities()" ${state.publicActivityLoading?'disabled':''}>${state.publicActivityLoading?'Loading…':'Load more activities'}</button>`:'';
  return `<main class="public-shell public-explore-page"><header class="topbar"><a class="brand" href="/" onclick="backToLanding();return false"><span class="brandmark">v</span> voxera</a><div class="top-right"><button class="btn btn-outline btn-small" onclick="openAuthChoice('login')">Log in</button><button class="btn btn-primary btn-small" onclick="openAuthChoice('signup')">Sign up</button></div></header><section class="public-hero public-explore-hero" style="--explore-hero-image:url('${photos.hero}')"><div class="explore-hero-copy"><span class="landing-eyebrow">OPEN OPPORTUNITIES · MADE FOR YOU</span><h1 class="page-title">Find an activity<br><em>that moves you.</em></h1><p>Discover welcoming programmes, events, campaigns, and services making a difference in communities like yours.</p><div class="explore-hero-note"><span aria-hidden="true">✳</span> Your next chapter can start here.</div></div></section><div class="toolbar discover-filters"><input id="guest-activity-search" class="search" type="search" placeholder="Search activities, organisations, or places" oninput="filterGuestActivities()"><select id="guest-activity-type" class="select" aria-label="Filter activities by type" onchange="filterGuestActivities()"><option value="all">All activity types</option>${types.map(type=>`<option value="${esc(type)}">${esc(type)}</option>`).join('')}</select></div><section class="explore-community-banner" style="--explore-banner-image:url('${photos.community}')"><div><span class="landing-eyebrow">PEOPLE · PLACE · POSSIBILITY</span><h2>Good things happen<br>when we come together.</h2></div><span class="explore-banner-mark" aria-hidden="true">v</span></section>${state.publicActivityError?`<div class="notice" role="alert">${esc(state.publicActivityError)}</div>`:state.publicActivities===null?'<p role="status">Loading public activities…</p>':`<div class="explore-results"><p id="guest-activity-count" class="row-meta" role="status">${activities.length} public ${activities.length===1?'activity':'activities'}</p><section class="grid programme-cards" id="guest-activities">${cards||emptyCard('No public activities yet','Check back when organisations publish new opportunities.')}</section>${loadMore}</div>`}<p class="row-meta explore-back-link"><button class="text-link" onclick="backToLanding()">← Back to landing page</button></p></main>`;
}
function guestOrganisationPage(){
  const data=state.publicOrganisation,organisation=data?.organisation;
  if(!organisation)return `<main class="public-shell"><header class="topbar"><a class="brand" href="/" onclick="closeGuestOrganisation();return false"><span class="brandmark">v</span> voxera</a></header>${state.publicOrgError?`<div class="notice" role="alert">${esc(state.publicOrgError)}</div>`:'<p role="status">Loading organisation page…</p>'}<button class="btn btn-outline" onclick="closeGuestOrganisation()">← Explore activities</button></main>`;
  const activities=(data.activities||[]).map(item=>`<article class="card guest-activity-card"><span class="badge">${esc(item.activity_type||'programme')}</span>${publicEnrollmentLabel(item)}<h2 class="card-title">${esc(item.title)}</h2><p>${esc(item.description||'')}</p><div class="row-meta">${esc(item.category)} · ${esc(item.format)} · ${esc(item.location)}<br>${dateLabel(item.start_date)} – ${dateLabel(item.end_date)} · ${esc(item.status)}</div><button class="btn btn-primary btn-small" onclick="openAuthChoice('signup')">Sign up to apply</button></article>`).join('');
  const profileSections=publicProfileSectionsMarkup(organisation.profile_sections);
  const galleryMarkup=publicGalleryMarkup(publicGallery?.albums||[]);
  const socialLabels={facebook:'Facebook',instagram:'Instagram',linkedin:'LinkedIn',tiktok:'TikTok',x:'X',youtube:'YouTube'};
  const socialLinks=Object.entries(organisation.social_links||{}).filter(([name,url])=>socialLabels[name]&&url).map(([name,url])=>`<a class="btn btn-outline btn-small social-profile-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${socialLabels[name]}</a>`).join('');
  const contactLinks=`${organisation.website_url?`<a class="btn btn-outline btn-small" href="${esc(organisation.website_url)}" target="_blank" rel="noopener noreferrer">Visit website ↗</a>`:''}${organisation.contact_email?`<a class="btn btn-outline btn-small" href="mailto:${esc(organisation.contact_email)}">Email organisation</a>`:''}${organisation.contact_phone?`<a class="btn btn-outline btn-small" href="tel:${esc(organisation.contact_phone)}">Call organisation</a>`:''}${socialLinks}`;
  const banner=organisation.banner_url?`<img class="public-organisation-banner" src="${esc(organisation.banner_url)}" alt="">`:'';
  return `<main class="public-shell public-organisation-site"><header class="topbar public-organisation-topbar"><button class="btn btn-outline btn-small" onclick="closeGuestOrganisation()">← Explore</button><nav class="public-organisation-nav" aria-label="Organisation page sections"><a href="#organisation-story">About</a><a href="#organisation-gallery">Gallery</a><a href="#organisation-activities">Activities</a></nav><div class="top-right"><button class="btn btn-outline btn-small" onclick="openAuthChoice('login')">Log in</button><button class="btn btn-primary btn-small" onclick="openAuthChoice('signup')">Sign up</button></div></header>${banner}<section class="public-hero" id="organisation-story">${organisation.image_url?`<img class="public-organisation-avatar" src="${esc(organisation.image_url)}" alt="">`:`<span class="public-organisation-avatar organisation-profile-fallback">${esc(initials(organisation.name))}</span>`}<span class="eyebrow">${esc(organisation.type)}</span><h1 class="page-title">${esc(organisation.name)}</h1>${organisation.location?`<p class="row-meta">${esc(organisation.location)}</p>`:''}<p class="page-subtitle">${esc(organisation.description||'')}</p>${contactLinks?`<div class="public-organisation-links">${contactLinks}</div>`:''}<button class="btn btn-primary" onclick="openAuthChoice('signup')">Connect with this organisation <span aria-hidden="true">↗</span></button>${profileSections}</section>${galleryMarkup}<section class="public-organisation-activities" id="organisation-activities"><div class="public-gallery-heading"><div><span class="landing-eyebrow">FIND YOUR NEXT STEP</span><h2>Published activities</h2></div></div><div class="grid programme-cards">${activities.length?activities:emptyCard('No published activities','This organisation has no public activities right now.')}</div></section></main>`;
}
function publicProfileSectionsMarkup(sections){
  if(!Array.isArray(sections)||!sections.length)return '';
  return `<div class="public-profile-sections">${sections.map(section=>`<section class="public-profile-section"><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p></section>`).join('')}</div>`;
}
function publicGalleryMarkup(albums){
  const heading=`<div class="public-gallery-heading"><div><span class="landing-eyebrow">MOMENTS FROM THE COMMUNITY</span><h2>Stories in pictures.</h2></div></div>`;
  if(publicGalleryError)return `<section class="public-gallery" id="organisation-gallery">${heading}<div class="notice" role="status">${esc(publicGalleryError)}</div></section>`;
  if(!albums.length)return `<section class="public-gallery" id="organisation-gallery">${heading}<div class="empty">${publicGallery?'This organisation has not shared gallery albums yet.':'Loading community stories…'}</div></section>`;
  return `<section class="public-gallery" id="organisation-gallery" aria-label="Organisation gallery">${heading}<div class="public-gallery-grid">${albums.map(album=>galleryAlbumCard(album,'public')).join('')}</div></section>`;
}
function galleryAlbumCard(album,mode='public'){
  const imageCovers=(album.media||[]).filter(item=>item.kind!=='video'&&item.url).map(item=>item.url);
  const coverUrl=imageCovers[0]||album.cover_url;
  const cover=coverUrl?`<img data-gallery-cover data-gallery-covers="${esc(JSON.stringify(imageCovers))}" data-gallery-cover-index="0" src="${esc(coverUrl)}" alt="" loading="lazy">`:'';
  const count=Number(album.media?.length)||0;
  const onclick=mode==='public'?`openPublicGalleryAlbum(${Number(album.id)})`:'';
  const mediaLabel=count?`${count} ${count===1?'moment':'moments'}`:'No media yet';
  if(mode==='public')return `<button class="public-gallery-album" onclick="${onclick}" aria-label="Open ${esc(album.title)} gallery"><div class="public-gallery-cover">${cover}<span>${mediaLabel}</span></div><span class="gallery-album-copy"><b>${esc(album.title)}</b><small>${album.comment_count||0} comments · Open gallery ↗</small></span></button>`;
  return `<article class="organisation-gallery-album"><button class="organisation-gallery-cover" onclick="openPublicGalleryAlbum(${Number(album.id)})" aria-label="Preview ${esc(album.title)} gallery">${cover}<span>${mediaLabel} · Preview ↗</span></button><div class="gallery-album-manager"><span class="gallery-album-copy"><b>${esc(album.title)}</b><small>${album.comment_count||0} public comments</small></span><div class="gallery-add-media"><button class="btn btn-outline btn-small" onclick="renameGalleryAlbum(${Number(album.id)})">Rename</button><button class="btn btn-outline btn-small" onclick="document.getElementById('gallery-upload-${Number(album.id)}').click()">Add media</button><input id="gallery-upload-${Number(album.id)}" class="gallery-file-input" type="file" accept="image/png,image/jpeg,image/webp,video/webm,video/mp4,video/ogg,.m4v,.ogv,.ogg" multiple onchange="uploadGalleryMedia(${Number(album.id)},this)"><button class="btn btn-soft btn-small" onclick="openPublicGalleryAlbum(${Number(album.id)})">Preview</button><button class="btn btn-outline btn-small" onclick="deleteGalleryAlbum(${Number(album.id)})">Delete</button></div></div></article>`;
}
function startGalleryCoverRotation(){
  if(galleryCoverRotationTimer!==null||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  galleryCoverRotationTimer=window.setInterval(()=>{
    if(document.hidden)return;
    document.querySelectorAll('[data-gallery-cover]').forEach(image=>{
      const covers=JSON.parse(image.dataset.galleryCovers||'[]');
      if(covers.length<2)return;
      const next=(Number(image.dataset.galleryCoverIndex||0)+1)%covers.length;
      image.dataset.galleryCoverIndex=String(next);
      image.classList.add('is-changing');
      image.addEventListener('load',()=>image.classList.remove('is-changing'),{once:true});
      image.addEventListener('error',()=>image.classList.remove('is-changing'),{once:true});
      image.src=covers[next];
    });
  },5000);
}
async function loadOrganisationGallery(){
  organisationGalleryError='';organisationGalleryLoading=true;
  renderReal();
  try{const result=await api('/api/organisation/gallery');organisationGalleryAlbums=result.albums||[];}
  catch(error){organisationGalleryError=error.message;organisationGalleryAlbums=[];}
  finally{organisationGalleryLoading=false;}
  renderReal();
}
async function createGalleryAlbum(event){
  event.preventDefault();
  const input=$('#gallery-album-title'),title=input?.value.trim();
  if(!title)return toast('Enter a title for your gallery album.');
  try{const result=await api('/api/organisation/gallery',{method:'POST',body:JSON.stringify({title})});organisationGalleryAlbums=[result.album,...organisationGalleryAlbums];renderReal();toast('Gallery album created.');}
  catch(error){toast(error.message);}
}
async function renameGalleryAlbum(id){
  const album=organisationGalleryAlbums.find(item=>Number(item.id)===Number(id));
  const title=window.prompt('Enter a new album title.',album?.title||'')?.trim();
  if(!title)return;
  try{const result=await api(`/api/organisation/gallery/${id}`,{method:'PATCH',body:JSON.stringify({title})});organisationGalleryAlbums=organisationGalleryAlbums.map(item=>Number(item.id)===Number(id)?result.album:item);renderReal();toast('Album title updated.');}
  catch(error){toast(error.message);}
}
async function deleteGalleryAlbum(id){
  const album=organisationGalleryAlbums.find(item=>Number(item.id)===Number(id));
  if(!window.confirm(`Delete “${album?.title||'this album'}” and all its media and comments?`))return;
  try{await api(`/api/organisation/gallery/${id}`,{method:'DELETE'});organisationGalleryAlbums=organisationGalleryAlbums.filter(item=>Number(item.id)!==Number(id));renderReal();toast('Gallery album deleted.');}
  catch(error){toast(error.message);}
}
async function uploadGalleryMedia(id,input){
  const files=[...(input.files||[])];
  input.value='';
  if(!files.length)return;
  for(const file of files){
    const isVideo=file.type.startsWith('video/')||/\.(?:webm|mp4|m4v|ogv|ogg)$/i.test(file.name);
    const maxBytes=isVideo?500*1024*1024:10*1024*1024;
    if(file.size>maxBytes){toast(`${file.name} is too large. Images are limited to 10 MB and videos to 500 MB.`);continue;}
    const form=new FormData();form.append('media',file,file.name);
    try{
      const response=await fetch('/api/organisation/gallery/'+id+'/media',{method:'POST',headers:{Authorization:['Bearer',authToken].join(' ')},body:form});
      if(!response.ok){let message='Could not upload this media file.';try{message=(await response.json()).detail||message;}catch{}throw new Error(message);}
      const result=await response.json();organisationGalleryAlbums=organisationGalleryAlbums.map(item=>Number(item.id)===Number(id)?result.album:item);renderReal();toast(`${file.name} uploaded.`);
    }catch(error){toast(`${file.name}: ${error.message}`);}
  }
}
async function loadPublicGallery(slug){
  publicGalleryError='';publicGallery=null;
  try{publicGallery=await api(`/api/public/organisations/${encodeURIComponent(slug)}/gallery`);}
  catch(error){publicGalleryError=error.message;}
  renderReal();
}
function openPublicGalleryAlbum(id){
  const album=(publicGallery?.albums||organisationGalleryAlbums).find(item=>Number(item.id)===Number(id));
  if(!album)return;
  activeGalleryAlbum=album;activeGalleryMediaIndex=0;galleryCommentDraft='';
  renderGalleryViewer();
}
function renderGalleryViewer(){
  document.querySelector('.gallery-viewer-backdrop')?.remove();
  if(!activeGalleryAlbum)return;
  const album=activeGalleryAlbum,media=album.media||[],item=media[activeGalleryMediaIndex];
  const asset=item?item.kind==='video'?`<video src="${esc(item.url)}" controls playsinline preload="metadata"></video>`:`<img src="${esc(item.url)}" alt="${esc(album.title)} · image ${activeGalleryMediaIndex+1}">`:'<div class="empty">This album has no photos or videos yet.</div>';
  const comments=(album.comments||[]).map(comment=>`<div class="gallery-comment"><small>${esc(comment.author_name||'Community member')} · ${dateLabel(comment.created_at)}</small>${esc(comment.body)}</div>`).join('')||'<p class="row-meta">Start the conversation with a kind comment.</p>';
  const thumbs=media.map((entry,index)=>`<button class="gallery-thumb ${index===activeGalleryMediaIndex?'active':''}" onclick="selectGalleryMedia(${index})" aria-label="Show gallery item ${index+1}">${entry.kind==='video'?`<video src="${esc(entry.url)}#t=0.1" muted preload="metadata"></video>`:`<img src="${esc(entry.url)}" alt="" loading="lazy">`}</button>`).join('');
  const slug=publicGallery?.organisation?.slug||state.organisationDetail?.organisation?.slug||'';
  const commentForm=role==='participant'?`<form class="gallery-comment-form" onsubmit="postGalleryComment(event,${album.id},'${esc(slug)}')"><label class="sr-only" for="gallery-comment-draft">Write a comment</label><textarea id="gallery-comment-draft" maxlength="1000" required placeholder="Share a thoughtful comment">${esc(galleryCommentDraft)}</textarea><button class="btn btn-primary btn-small">Post</button></form>`:`<div class="notice">Sign in as a participant to comment on this gallery.</div>`;
  document.body.insertAdjacentHTML('beforeend',`<div class="gallery-viewer-backdrop" role="presentation" onclick="if(event.target===this)closeGalleryViewer()"><section class="gallery-viewer" role="dialog" aria-modal="true" aria-label="${esc(album.title)} gallery"><div class="gallery-viewer-media">${asset}${media.length>1?`<button class="gallery-viewer-arrow previous" onclick="moveGalleryMedia(-1)" aria-label="Previous photo or video">‹</button><button class="gallery-viewer-arrow next" onclick="moveGalleryMedia(1)" aria-label="Next photo or video">›</button>`:''}</div><aside class="gallery-viewer-side"><button class="gallery-viewer-close close" onclick="closeGalleryViewer()" aria-label="Close gallery">×</button><h2 class="gallery-viewer-title">${esc(album.title)}</h2><div class="gallery-viewer-thumbs">${thumbs}</div><div class="gallery-comments" aria-live="polite">${comments}</div>${commentForm}</aside></section></div>`);
}
function closeGalleryViewer(){activeGalleryAlbum=null;document.querySelector('.gallery-viewer-backdrop')?.remove();}
function selectGalleryMedia(index){if(!activeGalleryAlbum)return;activeGalleryMediaIndex=Math.max(0,Math.min(index,(activeGalleryAlbum.media||[]).length-1));renderGalleryViewer();}
function moveGalleryMedia(direction){if(!activeGalleryAlbum)return;const total=activeGalleryAlbum.media?.length||0;if(!total)return;activeGalleryMediaIndex=(activeGalleryMediaIndex+direction+total)%total;renderGalleryViewer();}
async function postGalleryComment(event,albumId,slug){
  event.preventDefault();const input=$('#gallery-comment-draft'),body=input?.value.trim();if(!body)return toast('Write a comment first.');
  galleryCommentDraft=body;
  try{const result=await api(`/api/public/organisations/${encodeURIComponent(slug)}/gallery/${albumId}/comments`,{method:'POST',body:JSON.stringify({body})});activeGalleryAlbum.comments=[...(activeGalleryAlbum.comments||[]),result.comment];activeGalleryAlbum.comment_count=(activeGalleryAlbum.comment_count||0)+1;galleryCommentDraft='';if(publicGallery)publicGallery.albums=publicGallery.albums.map(album=>Number(album.id)===Number(albumId)?activeGalleryAlbum:album);if(organisationGalleryAlbums.length)organisationGalleryAlbums=organisationGalleryAlbums.map(album=>Number(album.id)===Number(albumId)?activeGalleryAlbum:album);renderGalleryViewer();}
  catch(error){toast(error.message);}
}
document.addEventListener('keydown',event=>{if(!activeGalleryAlbum)return;if(event.key==='Escape')closeGalleryViewer();if(event.key==='ArrowLeft')moveGalleryMedia(-1);if(event.key==='ArrowRight')moveGalleryMedia(1);});
function organisationGalleryPage(){
  const form=`<form class="organisation-gallery-form" onsubmit="createGalleryAlbum(event)"><div class="field"><label for="gallery-album-title">Album title</label><input id="gallery-album-title" maxlength="120" required placeholder="For example, Community garden launch"></div><button class="btn btn-primary" type="submit">Create album</button><p class="row-meta">Upload PNG, JPEG, or WebP photos up to 10 MB, and MP4, WebM, or Ogg videos up to 500 MB. Published albums are visible on your organisation page.</p></form>`;
  const content=organisationGalleryError?`<div class="notice" role="alert">${esc(organisationGalleryError)}</div>`:organisationGalleryLoading?'<div class="empty" role="status">Loading your gallery…</div>':organisationGalleryAlbums.length?`<div class="organisation-gallery-grid">${organisationGalleryAlbums.map(album=>galleryAlbumCard(album,'manage')).join('')}</div>`:'<div class="empty">Your albums will appear here. Create one to share moments from your organisation.</div>';
  return `${head('YOUR ORGANISATION · STORIES','Gallery','Create photo and video albums for your public organisation page.')}<section class="organisation-gallery-heading"><h1>Show your community the work.</h1><p>Share titled photo and video albums. Visitors can browse every item, open media full-screen, and leave comments while signed in as a participant.</p></section>${form}<section aria-label="Your gallery albums">${content}</section>`;
}
const organiserPageBeforeGallery=organizerPage;
organizerPage=function(){return page==='Gallery'?organisationGalleryPage():organiserPageBeforeGallery();};
window.organisationGalleryPage=organisationGalleryPage;
const participantDiscoverWithoutPublicSections=participantDiscoverReal;
participantDiscoverReal=function(){
  const markup=participantDiscoverWithoutPublicSections();
  const sections=state.organisationDetail?.organisation?.profile_sections;
  if(selectedOrganisationId===null||!Array.isArray(sections)||!sections.length)return markup;
  return markup.replace('</p><div class="organisation-profile-meta">',`</p>${publicProfileSectionsMarkup(sections)}<div class="organisation-profile-meta">`);
};
function filterGuestActivities(){
  const query=$('#guest-activity-search')?.value.trim().toLowerCase()||'';
  const type=$('#guest-activity-type')?.value||'all';
  let visible=0;
  document.querySelectorAll('.guest-activity-card').forEach(card=>{const show=(type==='all'||card.dataset.type===type)&&card.dataset.search.includes(query);card.hidden=!show;if(show)visible++;});
  const count=$('#guest-activity-count');if(count)count.textContent=`${visible} public ${visible===1?'activity':'activities'}`;
}
function openOrganisationContact(organisationId){
  const organisation=(state.organisations||[]).find(item=>Number(item.id)===Number(organisationId))||state.organisationDetail?.organisation;
  if(organisation?.ai_first_contact)openOrganisationAssistant(organisationId);
  else startOrganisationChat(organisationId);
}
async function startOrganisationChat(organisationId){
  try{
    const conversation=await api(`/api/conversations?organisation_id=${encodeURIComponent(organisationId)}`,{method:'POST'});
    selectedConversationId=conversation.id;conversationId=conversation.id;selectedDirectConversationId=null;
    messagesSection='chats';participantMessagesSection='chats';participantAiChatOpen=false;page='Messages';messageView='conversation';
    await hydrateReal();await loadConversation(conversation.id);await markConversationRead(conversation.id);renderReal();
  }catch(error){toast(error.message||'Could not open this organisation chat.');return false;}
  return true;
}

function organisationSignupPage(){return `<div class="login-shell"><form class="login-card" onsubmit="createOrganisation(event)"><button type="button" class="text-link auth-back" onclick="backToLanding()">← Back to landing page</button><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:28px">ORGANISATION · CREATE ACCOUNT</div><h1 class="page-title">Create your workspace</h1><p class="page-subtitle">Create an organisation workspace and its first organiser account. Each organisation manages its own activities and participants.</p><div class="field"><label>Organisation name</label><input id="setup-org" required minlength="2" maxlength="160" autocomplete="organization"></div><div class="field"><label>Organisation type</label><select id="setup-type"><option>NGO</option><option>LGA</option><option>Company</option><option>Community group</option><option>School</option><option>University</option><option>Government agency</option><option>Cooperative</option><option>Other</option></select></div><div class="field"><label>Your name</label><input id="setup-name" required minlength="2" autocomplete="name"></div><div class="field"><label>Organiser email</label><input id="setup-email" required type="email" autocomplete="email"></div>${passwordField('setup-password','Create password','new-password',10)}<small class="password-help">Use at least 10 characters.</small>${authProviders.email_verification?'<p class="row-meta">We’ll email a verification link before you can sign in.</p>':''}<button class="btn btn-primary" style="width:100%">Create organisation account</button>${authProviders.google?googleButton('signup'):''}</form></div>`;}

function participantSignupPage(){return `<div class="login-shell"><form class="login-card" onsubmit="registerReal(event)"><button type="button" class="text-link auth-back" onclick="backToLanding()">← Back to landing page</button><span class="brand"><span class="brandmark">v</span> voxera</span><div class="eyebrow" style="margin-top:24px">PARTICIPANT · CREATE ACCOUNT</div><h1 class="page-title">Join Voxera</h1><p class="page-subtitle">Create an account to discover and apply to programmes.</p><div class="field"><label>Your name</label><input id="register-name" required minlength="2" autocomplete="name"></div><div class="field"><label>Email</label><input id="register-user" type="email" required autocomplete="email"></div>${passwordField('register-password','Password','new-password',10)}<small class="password-help">Use at least 10 characters.</small><div class="field"><label>Preferred language</label><select id="register-language"><option>English</option><option>Pidgin</option><option>Yoruba</option><option>Hausa</option><option>Igbo</option></select></div><div class="field"><label>Community or area</label><input id="register-area" maxlength="100"></div><label class="toggle"><input type="checkbox" id="register-data" required> I agree that Voxera may use my information to provide programme services.</label><label class="toggle"><input type="checkbox" id="register-voice"> I consent to storing voice notes after transcription.</label><label class="toggle"><input type="checkbox" id="register-followup" checked> I agree to programme follow-up messages.</label>${authProviders.email_verification?'<p class="row-meta">We’ll email a verification link before you can sign in.</p>':''}<button class="btn btn-primary" style="width:100%;margin-top:16px">Create participant account</button>${authProviders.google?googleButton('signup'):''}<div class="row-meta" style="text-align:center;margin-top:14px">Already registered? <button type="button" class="text-link" onclick="openAuthChoice('login')">Log in</button></div></form></div>`;}


function chooseAuth(roleName,view){authRole=roleName;authView=view||(roleName==='organiser'&&setupRequired?'setup':'login');render();}
function openAuthChoice(intent){if(location.pathname.startsWith('/organisations/'))history.replaceState({},'','/');authIntent=intent==='signup'?'signup':'login';authView='choose';render();}
function openOrgSetup(){authRole='organiser';authView='setup';render();}
function backToLanding(){state.publicOrganisation=null;if(location.pathname.startsWith('/organisations/'))history.replaceState({},'','/');authView='landing';render();}
function backToAuth(){state.publicOrganisation=null;if(location.pathname.startsWith('/organisations/'))history.replaceState({},'','/');authView='choose';render();}
window.addEventListener('keydown',event=>{
  if(authToken||authView!=='choose'||event.ctrlKey||event.metaKey||event.altKey)return;
  const target=event.target;
  if(target instanceof HTMLElement&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))return;
  if(!/^[a-z]$/i.test(event.key)){ownerAccessSequence='';return;}
  ownerAccessSequence=(ownerAccessSequence+event.key.toLowerCase()).slice(-11);
  if(ownerAccessSequence==='voxeraowner'){
    ownerAccessSequence='';
    authRole='platform_owner';
    authView='login';
    render();
  }
});
async function loginReal(event){event.preventDefault();pendingAuthEmail=$('#login-email').value.trim();try{const result=await api(authRole==='platform_owner'?'/api/admin/auth/login':'/api/auth/login',{method:'POST',body:JSON.stringify({username:pendingAuthEmail,password:$('#login-password').value})});const allowed=authRole==='platform_owner'?result.user.role==='admin'&&result.user.is_platform_owner:authRole==='participant'?result.user.role==='participant':result.user.role==='organiser';if(!allowed)throw new Error(authRole==='participant'?'That email belongs to an organisation account. Choose Organisation to sign in.':authRole==='platform_owner'?'This account is not a platform owner.':'That email does not belong to an organisation account.');saveLogin(result);if(role==='admin')state.ownerOverview=await api('/api/admin/overview');else await hydrate();render();const signupGuideKey=`voxera-guide-pending-${pendingAuthEmail.toLowerCase()}`;if(localStorage.getItem(signupGuideKey)){localStorage.removeItem(signupGuideKey);showGuide(true);}}catch(error){if(error.message?.toLowerCase().includes('verify your email')){authView='verify';render();}else toast(error.message||'Sign-in failed.');}}

async function createOrganisation(event){
  event.preventDefault();
  const payload={organisation_name:$('#setup-org').value.trim(),organisation_type:$('#setup-type').value,name:$('#setup-name').value.trim(),username:$('#setup-email').value.trim(),password:$('#setup-password').value};
  try{const result=await api('/api/auth/register/organisation',{method:'POST',body:JSON.stringify(payload)});if(result.verification_required){localStorage.setItem(`voxera-guide-pending-${payload.username.toLowerCase()}`,'signup');pendingAuthEmail=payload.username;authRole='organiser';authView='verify';setupRequired=false;render();toast(result.message);return;}setupRequired=false;saveLogin(result);await hydrate();render();showGuide(true);}catch(error){toast(error.message);}
}

function saveLogin(result){authToken=result.token;currentUser=result.user;role=result.user.role;selectedDirectConversationId=null;participantMessagesSection='chats';state.participantDirectMessages=[];state.participantDirectConversations=[];state.participantPeers=[];messagesSection='chats';selectedGroupProgrammeId=null;state.groups=[];state.groupMessages=[];state.groupMembers=[];state.selectedGroup=null;localStorage.setItem('voxera-token',authToken);localStorage.removeItem('voxera-role');page=role==='admin'?'Overview':role==='participant'?'Home':'Dashboard';}

function accountAvatar(className='avatar'){const target=currentUser?.role==='participant'?'Profile':'Settings';return `<span class="${className} account-avatar-trigger" role="button" tabindex="0" aria-label="Open ${esc(target.toLowerCase())}" onclick="go('${target}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('${target}')}">${state.accountProfile?.image_available?'<img data-account-photo alt="">':''}<span class="avatar-fallback">${esc(initials(currentUser?.name||''))}</span></span>`;}
function applyTheme(theme){document.documentElement.dataset.theme=theme==='dark'?'dark':'light';}
function realTopbar(){const label=role==='admin'?'Platform owner console':role==='participant'?'Programmes for everyone':state.settings?.name||'Voxera';const landing=role==='participant'?'Home':'Dashboard';return `<header class="topbar workspace-topbar"><a class="brand workspace-brand" href="/" aria-label="Voxera home" onclick="event.preventDefault();go('${landing}')"><span class="brandmark">v</span><span>voxera</span></a><div class="workspace-title"><span>${role==='participant'?'YOUR SPACE':role==='admin'?'PLATFORM':'ORGANISATION HUB'}</span><b>${esc(label)}</b></div><div class="top-right workspace-actions">${role==='admin'?'':`<button class="help-button" onclick="showGuide(false)" aria-label="Open Voxera guide">${lucideIcon('circleHelp',17)}<span>Help</span></button>`}${role==='admin'?`<span class="avatar">${esc(initials(currentUser?.name||'Owner'))}</span>`:accountAvatar()}<button class="btn btn-outline btn-small" onclick="logout()">Sign out</button></div></header>`;}

function mobileMore(){document.body.insertAdjacentHTML('beforeend',`<div class="modal-back mobile-menu-back" onclick="if(event.target===this)closeModal()"><div class="modal mobile-menu"><div class="modal-top"><div><h2>Workspace tools</h2><p>Choose a section.</p></div><button class="close" onclick="closeModal()">×</button></div>${['Participants','Follow-Up','Reports','Gallery','Settings'].map(name=>`<button class="nav-item" onclick="closeModal();go('${name}')"><span class="nav-icon">${name==='Follow-Up'?lucideIcon('bellRing',18):icon[name]||'•'}</span>${name==='Participants'?'People & attendance':name}</button>`).join('')}</div></div>`);}

function unreadMessageCount(){
  const conversations=state.conversations||[];
  if(currentUser?.role==='participant')return conversations.reduce((total,conversation)=>total+(Number(conversation.unread_count)||0),0)+(state.participantDirectConversations||[]).reduce((total,conversation)=>total+(Number(conversation.unread_count)||0),0);
  const openCases=(state.cases||[]).filter(item=>item.trigger_type!=='automated_followup_reply'&&(item.status==='escalated'||item.status==='open'));
  const openKeys=new Set(openCases.map(item=>`${item.participant_id}:${item.programme_id}`));
  const unread=conversations.reduce((total,conversation)=>total+(conversation.kind==='ai_followup'&&openKeys.has(`${conversation.participant_id}:${conversation.programme_id}`)?0:Number(conversation.unread_count)||0),0);
  return unread+openCases.length;
}
function unreadBadge(){const count=unreadMessageCount();return count?`<span class="nav-unread" aria-label="${count} unread or unanswered messages">${count>99?'99+':count}</span>`:'';}
function unreadMessageBadge(){return unreadBadge();}
function updateMessageBadges(){
  const badge=unreadBadge();
  document.querySelectorAll('[data-message-nav]').forEach(button=>{
    button.querySelector('.nav-unread')?.remove();
    if(!badge)return;
    const iconContainer=button.querySelector('.nav-icon,.mobile-nav-icon');
    iconContainer?.insertAdjacentHTML('beforeend',badge);
  });
}
function realLayout(content){
  if(role==='admin')return `${realTopbar()}<div class="owner-layout"><aside class="owner-sidebar"><div class="side-label">Platform owner</div>${['Overview','Accounts','Organisations','Programmes','Activity'].map(name=>`<button class="nav-item ${page===name?'active':''}" onclick="openOwnerPage('${name}')"><span class="nav-icon">${lucideIcon(({Overview:'layoutDashboard',Accounts:'usersRound',Organisations:'bookOpen',Programmes:'calendarCheck',Activity:'chartNoAxesColumnIncreasing'})[name],18)}</span>${name}</button>`).join('')}<div class="side-bottom"><div class="notice">Administrative actions are recorded in the platform activity log. Live-class access follows normal enrolment rules.</div></div></aside><main class="owner-content">${content}</main></div>`;
  if(role==='participant')return `${realTopbar()}<div class="participant-layout">${content}</div>`;
  if(page==='Messages'||(page==='Follow-Up'&&messageView==='conversation')){
    const detailOpen=messageView==='conversation'||(messagesSection==='groups'&&selectedGroupProgrammeId!==null);
    const nav=page==='Messages'&&!detailOpen?organiserMobileNavigation():'';
    return `${realTopbar()}<main class="organiser-chat-shell ${detailOpen?'is-conversation':''}">${messageView==='conversation'?'':`<div class="organiser-chat-nav"><button class="btn btn-outline btn-small" onclick="go('Dashboard')">← Dashboard</button></div>`}${content}</main>${nav}`;
  }
  const desktop=organiserPages.map(name=>`<button class="nav-item ${page===name||(page==='Programme Classes'&&name==='Programmes')?'active':''}" ${name==='Messages'?'data-message-nav':''} onclick="go('${name}')"><span class="nav-icon">${name==='Follow-Up'?lucideIcon('bellRing',18):icon[name]||'•'}${name==='Messages'?unreadBadge():''}</span>${name==='Participants'?'People & attendance':name}</button>`).join('');
  const mobile=['Dashboard','Programmes','Messages'].map(name=>`<button class="mobile-nav-item ${page===name||(page==='Programme Classes'&&name==='Programmes')?'active':''}" ${name==='Messages'?'data-message-nav':''} onclick="go('${name}')"><span class="mobile-nav-icon">${icon[name]||'•'}${name==='Messages'?unreadBadge():''}</span><small>${name==='Messages'?'Inbox':name}</small></button>`).join('');
  return `${realTopbar()}<div class="layout"><aside class="sidebar"><div class="side-label">Workspace</div>${desktop}<div class="side-bottom"><button class="nav-item" onclick="showGuide(false)"><span class="nav-icon">ⓘ</span>Help & guide</button><div class="notice" style="margin:10px 4px 0">Your organisation’s records are stored on this server.</div></div></aside><main class="content">${content}</main></div><nav class="mobile-organiser-nav" aria-label="Organiser navigation">${mobile}<button class="mobile-nav-item" onclick="mobileMore()"><span>•••</span><small>More</small></button></nav>`;
}
function organiserMobileNavigation(){return `<nav class="mobile-organiser-nav" aria-label="Organiser navigation">${['Dashboard','Programmes','Messages'].map(name=>`<button class="mobile-nav-item ${page===name?'active':''}" ${name==='Messages'?'data-message-nav':''} onclick="go('${name}')"><span class="mobile-nav-icon">${icon[name]||'•'}${name==='Messages'?unreadBadge():''}</span><small>${name==='Messages'?'Inbox':name}</small></button>`).join('')}<button class="mobile-nav-item" onclick="mobileMore()"><span>•••</span><small>More</small></button></nav>`;}
function ownerConsolePage(){if(page==='Accounts')return ownerAccountsPage();if(page==='Organisations')return ownerOrganisationsPage();if(page==='Programmes')return ownerProgrammesPage();if(page==='Activity')return ownerActivityPage();return ownerOverviewPage();}
function ownerOverviewPage(){const counts=state.ownerOverview?.counts||{};const stats=[['Participants',counts.participants],['Organisation accounts',counts.organiser_accounts],['Organisations',counts.organisations],['Programmes',counts.programmes],['Sign-ins today',counts.sign_ins_today],['Live classes',counts.live_sessions]];const recent=state.ownerOverview?.recent_activity||[];return `<div class="owner-page-head"><div><div class="eyebrow">PRIVATE · AUDITED</div><h1 class="page-title">Platform overview</h1><p class="page-subtitle">Your separate Voxera owner workspace. Every moderation and account action is recorded.</p></div><button class="btn btn-outline" onclick="loadOwnerOverview()">Refresh</button></div><section class="owner-stat-grid">${stats.map(([label,value])=>`<article class="owner-stat"><span>${esc(label)}</span><b>${value??'—'}</b></article>`).join('')}</section><section class="owner-overview-grid"><article class="card owner-panel"><div class="card-head"><div><div class="card-title">Owner assistant</div><div class="row-meta">Read-only operational answers · no external AI or private chat access</div></div><span class="badge">${state.ownerAssistantSource==='local_model'?'Local AI model enabled':'Local data only'}</span></div><form class="owner-assistant-form" onsubmit="askOwnerAssistant(event)"><label class="sr-only" for="owner-question">Ask about platform activity</label><textarea id="owner-question" rows="2" maxlength="1200" placeholder="Ask about registrations, sign-ins, organisations or programmes"></textarea><button class="btn btn-primary" type="submit">Ask assistant</button></form><div class="owner-assistant-answer" role="status" aria-live="polite">${state.ownerAssistantAnswer?esc(state.ownerAssistantAnswer):'I can summarize registrations and sign-ins, organisation archives, programme moderation, and live-class counts. I cannot access private message content or make changes.'}</div></article><article class="card owner-panel"><div class="card-head"><div class="card-title">Latest platform activity</div><button class="text-link" onclick="openOwnerPage('Activity')">Full activity →</button></div>${ownerActivityRows(recent)}</article></section><div class="owner-safety-note"><b>Live-class integrity:</b> Owner controls do not bypass participant enrolment or grant hidden live-class access. Active classes must be ended normally before programme moderation or organisation archiving.</div>`;}
function ownerActivityRows(items){return items.length?`<div class="owner-activity-list">${items.map(item=>`<article class="owner-activity-row"><span class="owner-activity-dot"></span><div><b>${esc((item.action||'').replaceAll('_',' '))}</b><small>${esc(item.actor_name||'System')}${item.actor_email?` · ${esc(item.actor_email)}`:''}${item.detail?` · ${esc(item.detail)}`:''}</small></div><time>${esc(new Date(item.created_at).toLocaleString())}</time></article>`).join('')}</div>`:'<div class="empty">No platform activity recorded yet.</div>';}
function ownerAccountsPage(){const result=state.ownerUsers||{items:[],total:0,offset:0,limit:50};return `<div class="owner-page-head"><div><div class="eyebrow">ACCOUNT DIRECTORY</div><h1 class="page-title">Accounts</h1><p class="page-subtitle">Search participant and organiser names, email addresses, sign-in dates, and status. Directory access is audited.</p></div><button class="btn btn-outline" onclick="loadOwnerUsers()">Refresh</button></div><form class="owner-toolbar" onsubmit="searchOwnerAccounts(event)"><input id="owner-account-query" type="search" value="${esc(state.ownerUsersQuery||'')}" placeholder="Search names, emails, organisations"><select id="owner-account-role"><option value="all" ${state.ownerUsersRole==='all'?'selected':''}>All accounts</option><option value="participant" ${state.ownerUsersRole==='participant'?'selected':''}>Participants</option><option value="organiser" ${state.ownerUsersRole==='organiser'?'selected':''}>Organisers</option></select><button class="btn btn-primary btn-small">Search accounts</button></form><div class="owner-results-meta">${result.total} account${result.total===1?'':'s'} · showing ${result.items.length?result.offset+1:0}–${result.offset+result.items.length}</div><div class="card owner-table-wrap"><table class="table owner-table"><thead><tr><th>Name / role</th><th>Email</th><th>Organisation</th><th>Created</th><th>Last sign-in</th><th>Status / actions</th></tr></thead><tbody>${result.items.map(account=>`<tr><td><b>${esc(account.name)}</b><small>${esc(account.role)}</small></td><td><a href="mailto:${esc(account.email)}">${esc(account.email)}</a></td><td>${esc(account.organisation_name||'—')}</td><td>${esc(dateLabel(account.created_at))}</td><td>${account.last_sign_in?esc(new Date(account.last_sign_in).toLocaleString()):'Never'}</td><td><span class="badge ${account.is_active?'':'gray'}">${account.is_active?'Active':'Blocked'}</span><div class="owner-row-actions"><button class="btn btn-outline btn-small" onclick="openOwnerAction('${account.is_active?'block':'unblock'}',${account.id})">${account.is_active?'Block':'Unblock'}</button>${account.role==='participant'?`<button class="btn btn-soft btn-small danger" onclick="openOwnerAction('delete-participant',${account.id})">Delete</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6">No accounts match this search.</td></tr>'}</tbody></table></div><div class="owner-pagination"><button class="btn btn-outline btn-small" ${result.offset<=0?'disabled':''} onclick="pageOwnerAccounts(-1)">Previous</button><button class="btn btn-outline btn-small" ${result.offset+result.limit>=result.total?'disabled':''} onclick="pageOwnerAccounts(1)">Next</button></div>`;}
function ownerOrganisationsPage(){const organisations=state.ownerOrganisations||[];return `<div class="owner-page-head"><div><div class="eyebrow">TENANT MANAGEMENT</div><h1 class="page-title">Organisations</h1><p class="page-subtitle">Archive preserves historical programmes and participant records; restore is reversible.</p></div><button class="btn btn-outline" onclick="loadOwnerOrganisations()">Refresh</button></div><div class="owner-card-list">${organisations.map(org=>`<article class="card owner-entity-card"><div><h2>${esc(org.name)}</h2><span class="badge ${org.is_archived?'gray':''}">${org.is_archived?'Archived':'Active'}</span><p>${esc(org.type)} · ${org.organiser_count} organiser account${org.organiser_count===1?'':'s'} · ${org.programme_count} programmes (${org.active_programmes} active)</p><div class="row-meta">Organiser email${org.organiser_count===1?'':'s'}: ${esc(org.organiser_emails||'—')}</div></div><button class="btn ${org.is_archived?'btn-primary':'btn-outline'} btn-small" onclick="openOwnerAction('${org.is_archived?'unarchive-org':'archive-org'}',${org.id})">${org.is_archived?'Restore organisation':'Archive organisation'}</button></article>`).join('')||'<div class="empty">No organisations found.</div>'}</div>`;}
function ownerProgrammesPage(){const programmes=state.ownerProgrammes||[];return `<div class="owner-page-head"><div><div class="eyebrow">PROGRAMME MODERATION</div><h1 class="page-title">Programmes</h1><p class="page-subtitle">Blocking removes public discovery and new applications. Current enrolments and history remain intact.</p></div><button class="btn btn-outline" onclick="loadOwnerProgrammes()">Refresh</button></div><div class="owner-card-list">${programmes.map(programme=>`<article class="card owner-entity-card"><div><h2>${esc(programme.title)}</h2><span class="badge ${programme.admin_blocked?'gray':''}">${programme.admin_blocked?'Blocked':esc(programme.status)}</span><p>${esc(programme.organisation_name||'Organisation unavailable')} · ${dateLabel(programme.start_date)} – ${dateLabel(programme.end_date)}</p><div class="row-meta">${programme.enrolled_count} enrolled/completed · ${programme.pending_count} pending · ${programme.live_count} live</div>${programme.admin_blocked?`<small class="owner-moderation-reason">Reason: ${esc(programme.admin_block_reason)}</small>`:''}</div><button class="btn ${programme.admin_blocked?'btn-primary':'btn-outline'} btn-small" ${programme.live_count?'disabled title="End live classes first"':''} onclick="openOwnerAction('${programme.admin_blocked?'unblock-programme':'block-programme'}',${programme.id})">${programme.admin_blocked?'Unblock programme':'Block programme'}</button></article>`).join('')||'<div class="empty">No programmes found.</div>'}</div>`;}
function ownerActivityPage(){const result=state.ownerActivity||{items:[],total:0,limit:50,offset:0};return `<div class="owner-page-head"><div><div class="eyebrow">TRANSPARENT AUDIT TRAIL</div><h1 class="page-title">Platform activity</h1><p class="page-subtitle">Successful sign-ins, registrations, and audited owner actions. Message contents and microphone/video content are not shown here.</p></div><button class="btn btn-outline" onclick="loadOwnerActivity()">Refresh</button></div><article class="card owner-panel">${ownerActivityRows(result.items)}</article><div class="owner-pagination"><span class="owner-results-meta">${result.total} events · ${result.items.length?result.offset+1:0}–${result.offset+result.items.length}</span><button class="btn btn-outline btn-small" ${result.offset<=0?'disabled':''} onclick="pageOwnerActivity(-1)">Previous</button><button class="btn btn-outline btn-small" ${result.offset+result.limit>=result.total?'disabled':''} onclick="pageOwnerActivity(1)">Next</button></div>`;}
async function loadOwnerOverview(){try{state.ownerOverview=await api('/api/admin/overview');renderReal();}catch(error){toast(error.message);}}
async function loadOwnerUsers(){try{const params=new URLSearchParams({q:state.ownerUsersQuery||'',role_filter:state.ownerUsersRole||'all',limit:'50',offset:String(state.ownerUsersOffset||0)});state.ownerUsers=await api(`/api/admin/users?${params}`);renderReal();}catch(error){toast(error.message);}}
async function loadOwnerOrganisations(){try{state.ownerOrganisations=await api('/api/admin/organisations');renderReal();}catch(error){toast(error.message);}}
async function loadOwnerProgrammes(){try{state.ownerProgrammes=await api('/api/admin/programmes');renderReal();}catch(error){toast(error.message);}}
async function loadOwnerActivity(){try{const offset=state.ownerActivityOffset||0;state.ownerActivity=await api(`/api/admin/audit?limit=50&offset=${offset}`);renderReal();}catch(error){toast(error.message);}}
function openOwnerPage(next){page=next;if(next==='Overview')loadOwnerOverview();else if(next==='Accounts')loadOwnerUsers();else if(next==='Organisations')loadOwnerOrganisations();else if(next==='Programmes')loadOwnerProgrammes();else if(next==='Activity')loadOwnerActivity();renderReal();}
function searchOwnerAccounts(event){event.preventDefault();state.ownerUsersQuery=$('#owner-account-query').value.trim();state.ownerUsersRole=$('#owner-account-role').value;state.ownerUsersOffset=0;loadOwnerUsers();}
function pageOwnerAccounts(direction){state.ownerUsersOffset=Math.max(0,(state.ownerUsersOffset||0)+direction*50);loadOwnerUsers();}
function pageOwnerActivity(direction){state.ownerActivityOffset=Math.max(0,(state.ownerActivityOffset||0)+direction*50);loadOwnerActivity();}
async function askOwnerAssistant(event){event.preventDefault();const input=$('#owner-question');const question=input?.value.trim();if(!question)return;const answer=$('.owner-assistant-answer');const button=event.currentTarget.querySelector('button[type=submit]');if(button){button.disabled=true;button.textContent='Checking live platform data…';}if(answer)answer.textContent='Checking current platform aggregates…';try{const result=await api('/api/admin/assistant',{method:'POST',body:JSON.stringify({question})});state.ownerAssistantAnswer=result.answer;state.ownerAssistantSource=result.source;renderReal();}catch(error){if(answer)answer.textContent=error.message;else toast(error.message);}finally{const current=document.querySelector('.owner-assistant-form button[type=submit]');if(current){current.disabled=false;current.textContent='Ask assistant';}}}
function openOwnerAction(action,id){const accounts=state.ownerUsers?.items||[];const account=accounts.find(item=>item.id===id);const org=(state.ownerOrganisations||[]).find(item=>item.id===id);const programme=(state.ownerProgrammes||[]).find(item=>item.id===id);const target=account||org||programme;if(!target)return toast('Refresh this list and try again.');const deleting=action==='delete-participant';const verb=action==='block'?'Block account':action==='unblock'?'Unblock account':action==='archive-org'?'Archive organisation':action==='unarchive-org'?'Restore organisation':action==='block-programme'?'Block programme':action==='unblock-programme'?'Unblock programme':'Delete participant permanently';const confirmation=deleting?`<div class="field"><label for="owner-confirm-email">Type ${esc(target.email)} to confirm</label><input id="owner-confirm-email" type="email" required autocomplete="off"></div><div class="field"><label for="owner-action-password">Confirm with your owner password</label><input id="owner-action-password" type="password" required autocomplete="current-password"></div>`:'';document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><form class="modal owner-action-modal" onsubmit="submitOwnerAction(event)"><div class="modal-top"><div><span class="eyebrow">AUDITED OWNER ACTION</span><h2>${verb}</h2></div><button type="button" class="close" onclick="closeModal()" aria-label="Close">×</button></div><p><b>${esc(target.name||target.title)}</b>${target.email?` · ${esc(target.email)}`:''}</p>${deleting?'<div class="notice owner-danger-note">This permanently removes this participant account and personal programme records. This cannot be undone.</div>':''}${!deleting?`<div class="field"><label for="owner-action-reason">Reason (required)</label><textarea id="owner-action-reason" minlength="3" maxlength="500" required rows="3" placeholder="Record why you are taking this action"></textarea></div>`:''}${confirmation}<input type="hidden" name="action" value="${action}"><input type="hidden" name="target-id" value="${id}"><div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn ${deleting?'btn-soft danger':'btn-primary'}" type="submit">${verb}</button></div></form></div>`);}
async function submitOwnerAction(event){event.preventDefault();const form=event.currentTarget;const action=form.elements.action.value;const id=Number(form.elements['target-id'].value);const reason=$('#owner-action-reason')?.value.trim()||'Administrative account action';const routes={block:[`/api/admin/users/${id}`,'PATCH',{active:false,reason}],unblock:[`/api/admin/users/${id}`,'PATCH',{active:true,reason}],'archive-org':[`/api/admin/organisations/${id}`,'PATCH',{archived:true,reason}],'unarchive-org':[`/api/admin/organisations/${id}`,'PATCH',{archived:false,reason}],'block-programme':[`/api/admin/programmes/${id}`,'PATCH',{blocked:true,reason}],'unblock-programme':[`/api/admin/programmes/${id}`,'PATCH',{blocked:false,reason}]};try{if(action==='delete-participant'){await api(`/api/admin/participants/${id}`,{method:'DELETE',body:JSON.stringify({password:$('#owner-action-password').value,confirm_email:$('#owner-confirm-email').value.trim()})});}else{const [path,method,payload]=routes[action];await api(path,{method,body:JSON.stringify(payload)});}closeModal();toast(action==='delete-participant'?'Participant permanently deleted.':action.startsWith('archive')?'Organisation archived; history preserved.':'Owner action completed and logged.');if(page==='Accounts')await loadOwnerUsers();else if(page==='Organisations')await loadOwnerOrganisations();else if(page==='Programmes')await loadOwnerProgrammes();await loadOwnerOverview();}catch(error){toast(error.message);}}
function renderReal(){const app=document.getElementById('app');if(!app)return;const publicProfile=location.pathname.match(/^\/organisations\/([^/]+)\/?$/);app.innerHTML=publicProfile?guestOrganisationPage():authToken?realLayout(role==='admin'?ownerConsolePage():role==='participant'?participant():organizerPage()):authView==='guest'?guestExplorePage():authView==='landing'?landingPage():setupPage();app.querySelector('#register-button')?.remove();if(app.querySelector('[data-gallery-cover]'))startGalleryCoverRotation();if(authView==='landing')prepareLandingMotion();if(role==='participant'&&page==='Live Class')window.attachParticipantLiveVideo?.();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});}
const baseHydrateReal=window.hydrate;
async function hydrateReal(){
  if(role==='admin')return;
  await baseHydrateReal();
  if(!authToken||!currentUser)return;
  try{
    const [programmes,enrolments,conversations,accountProfile,groups]=await Promise.all([api('/api/programmes'),api('/api/enrolments'),api('/api/conversations'),api('/api/account/profile'),api('/api/groups')]);
    state.accountProfile=accountProfile;currentUser={...currentUser,...accountProfile};applyTheme(accountProfile.theme);
    state.programmes=programmes;state.enrolments=enrolments;state.applications=enrolments;state.applied=enrolments.filter(e=>['applied','waitlisted'].includes(e.status)).map(e=>e.programme_id);state.conversations=conversations;state.groups=groups;
    if(role==='participant'){
      state.organisations=await api('/api/organisations');
      state.aiStatus=await api('/api/ai/status').catch(()=>null);
      state.profile=await api('/api/profile');state.certificates=await api('/api/certificates');
      const attendance=await api('/api/participant/attendance');state.attendance=attendance;
      const [participantPeers,directConversations]=await Promise.all([api('/api/participant/peers'),api('/api/participant/direct-conversations')]);
      state.participantPeers=participantPeers;state.participantDirectConversations=directConversations;
      const participantConversations=conversations.filter(item=>['programme','ai_followup','organisation'].includes(item.kind));
      if(!participantConversations.length){selectedConversationId=null;conversationId=null;state.messages=[];messageView='inbox';}else if(messageView==='conversation'&&participantConversations.some(item=>Number(item.id)===Number(selectedConversationId))){conversationId=selectedConversationId;await loadConversation(selectedConversationId);}else{conversationId=null;state.messages=[];}
    }else{
      const [people,cases]=await Promise.all([api('/api/participants'),api('/api/cases')]);state.people=people;state.cases=cases;state.applications=enrolments;
      if(!conversations.length){selectedConversationId=null;conversationId=null;state.messages=[];messageView='inbox';}else if(messageView==='conversation'&&conversations.some(item=>item.id===selectedConversationId)){conversationId=selectedConversationId;await loadConversation(selectedConversationId);}else{conversationId=null;state.messages=[];}
    }
    if(role!=='participant'){
      const [reports,attendance,settings,followup,followupActivity]=await Promise.all([api('/api/reports'),api('/api/attendance'),api('/api/settings'),api('/api/followup/settings'),api('/api/followup/activity')]);
      state.reports=reports;state.attendance=attendance;state.settings=settings;state.followupSettings=followup;state.followupActivity=followupActivity;
      state.sessionsByProgramme={};
      for(const programme of state.programmes){state.sessionsByProgramme[programme.id]=await api(`/api/programmes/${programme.id}/sessions`);for(const session of state.sessionsByProgramme[programme.id]){try{session.live_state=(await api(`/api/sessions/${session.id}/live`)).state;}catch{session.live_state=null;}}}
    }else{
      const participantSessions=await api('/api/participant/sessions');
      state.sessionsByProgramme={};
      for(const session of participantSessions)(state.sessionsByProgramme[session.programme_id]||=[]).push(session);
      const enrolledIds=new Set((state.enrolments||[]).filter(item=>['enrolled','completed'].includes(item.status)).map(item=>item.programme_id));
      await Promise.all(Object.entries(state.sessionsByProgramme).filter(([programmeId])=>enrolledIds.has(Number(programmeId))).flatMap(([,sessions])=>sessions.map(async session=>{try{session.live_state=(await api(`/api/sessions/${session.id}/live`)).state;}catch{session.live_state=null;}})));
    }
  }catch(error){console.warn('Voxera data refresh:',error.message);}
}

async function syncParticipantProgrammeData(){
  if(programmeSyncInFlight||!authToken||currentUser?.role!=='participant'||!['Home','Discover','My Programmes','Programme Detail'].includes(page))return;
  programmeSyncInFlight=true;
  try{
    const [programmes,enrolments]=await Promise.all([api('/api/programmes'),api('/api/enrolments')]);
    const participantSessions=await api('/api/participant/sessions');
    const sessionsByProgramme={};
    for(const session of participantSessions)(sessionsByProgramme[session.programme_id]||=[]).push(session);
    const enrolledIds=new Set(enrolments.filter(item=>['enrolled','completed'].includes(item.status)).map(item=>item.programme_id));
    await Promise.all(Object.entries(sessionsByProgramme).filter(([programmeId])=>enrolledIds.has(Number(programmeId))).flatMap(([,sessions])=>sessions.map(async session=>{try{session.live_state=(await api(`/api/sessions/${session.id}/live`)).state;}catch{session.live_state=null;}})));
    const before=JSON.stringify([(state.programmes||[]).map(({id,title,status,start_date,end_date,image_url})=>({id,title,status,start_date,end_date,image_url})),state.enrolments,state.sessionsByProgramme]);
    state.programmes=programmes;state.enrolments=enrolments;state.applications=enrolments;state.sessionsByProgramme=sessionsByProgramme;
    const after=JSON.stringify([programmes.map(({id,title,status,start_date,end_date,image_url})=>({id,title,status,start_date,end_date,image_url})),enrolments,sessionsByProgramme]);
    if(before!==after&& !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))renderReal();
  }catch(error){console.warn('Could not refresh participant programme updates:',error.message);}
  finally{programmeSyncInFlight=false;}
}

async function syncOrganisationActivityData(){
  if(organisationSyncInFlight||!authToken||role==='participant'||document.visibilityState==='hidden'||!['Dashboard','Reports','Attendance','Participants','Programmes'].includes(page))return;
  organisationSyncInFlight=true;
  try{
    const [reports,enrolments,attendance,cases]=await Promise.all([api('/api/reports'),api('/api/enrolments'),api('/api/attendance'),api('/api/cases')]);
    const [programmes,people]=await Promise.all([
      ['Dashboard','Programmes'].includes(page)?api('/api/programmes'):Promise.resolve(state.programmes||[]),
      page==='Participants'?api('/api/participants'):Promise.resolve(state.people||[])
    ]);
    const before=JSON.stringify([state.reports&&(({generated_at,...data})=>data)(state.reports),state.enrolments,state.attendance,state.cases,state.programmes,state.people]);
    state.reports=reports;state.enrolments=enrolments;state.applications=enrolments;state.applied=enrolments.filter(item=>['applied','waitlisted'].includes(item.status)).map(item=>item.programme_id);state.people=people;state.cases=cases;state.attendance=attendance;state.programmes=programmes;
    const after=JSON.stringify([(({generated_at,...data})=>data)(reports),enrolments,attendance,cases,programmes,people]);
    if(before!==after&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))renderReal();
  }catch(error){console.warn('Could not refresh organiser activity:',error.message);}
  finally{organisationSyncInFlight=false;}
}

function percent(value){return `${Math.round(Number(value)||0)}%`;}
function dateLabel(value){if(!value)return 'Date not set';const d=new Date(`${value.slice(0,10)}T12:00:00`);return Number.isNaN(d.valueOf())?'Date not set':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});}
function emptyCard(title,body,action=''){return `<div class="card empty-state"><h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;}
function statReal(label,value,foot,mark){return stat(label,String(value),foot,mark);}

function dashboardReal(){
  const report=state.reports||{};const metrics=report.metrics||{};const programmes=state.programmes||[];const next=(state.attendance||[]).filter(a=>a.valid).slice(0,4);
  return `<section class="org-dashboard-hero" style="--org-dashboard-image:url('${stockPhoto('photo-1552664730-d307ca884978',1500)}')"><div><span class="landing-eyebrow">YOUR ORGANISATION · YOUR IMPACT</span><h1>Welcome, ${esc(currentUser?.name||'')}</h1><p>A live view of ${esc(state.settings?.name||'your organisation')}. Bring your programmes and community story together in one place.</p><div class="org-hero-actions"><button class="btn btn-primary" onclick="openModal('new-programme')">＋ New programme</button><button class="btn btn-outline" onclick="go('Gallery')">Open organisation gallery</button></div></div><span class="org-hero-emblem" aria-hidden="true">v</span></section><section class="grid stats">${statReal('Published programmes',metrics.active_programmes||0,'Open or ongoing','▤')}${statReal('Participants',metrics.participant_count||0,'Approved or enrolled','♙')}${statReal('Average attendance',percent(metrics.average_attendance||0),'From valid attendance records','◷')}${statReal('Open escalations',metrics.open_escalations||0,'Cases awaiting staff','⚑')}</section><section class="grid split"><article class="card"><div class="card-head"><div class="card-title">Your programmes</div><button class="text-link" onclick="go('Programmes')">View all →</button></div>${programmes.length?`<div class="programme-list">${programmes.slice(0,5).map(p=>`<div class="programme-row"><span class="programme-art">${iconFormat(p.format)}</span><div class="row-main"><div class="row-title">${esc(p.title)}</div><div class="row-meta">${esc(p.organisation_name||state.settings?.name||'')} · ${dateLabel(p.start_date)} · ${esc(p.status)}</div></div><span class="badge">${p.enrolled_count||0}/${p.capacity}</span></div>`).join('')}</div>`:emptyCard('No programmes yet','Create and publish your first programme. Participants will see it in Discover once it is open.','<button class="btn btn-primary" onclick="openModal(\'new-programme\')">Create programme</button>')}</article><article class="card"><div class="card-head"><div class="card-title">Recent attendance</div><button class="text-link" onclick="go('Attendance')">Open register →</button></div>${next.length?next.map(a=>`<div class="programme-row"><span class="mini-avatar">${esc(initials(a.participant_name))}</span><div class="row-main"><div class="row-title">${esc(a.participant_name)}</div><div class="row-meta">${esc(a.programme_title)} ·${esc(a.session_title)}</div></div><span class="badge">${esc(a.mode)}</span></div>`).join(''):emptyCard('No attendance recorded','Attendance appears here after participants check in or complete a session.')}</article></section><section class="grid split" style="margin-top:16px"><article class="card"><div class="card-head"><div class="card-title">At a glance</div></div><div class="profile-option"><span>Applicants awaiting review</span><b>${(state.applications||[]).filter(x=>x.status==='applied').length}</b></div><div class="profile-option"><span>Participants at risk</span><b>${metrics.at_risk_count||0}</b></div><div class="profile-option"><span>Certificates issued</span><b>${metrics.certificates_issued||0}</b></div></article><article class="card"><div class="card-head"><div class="card-title">Getting started</div></div><p class="row-meta">Publish a programme, review applications, schedule sessions, and record attendance. The Help guide can walk you through each section.</p><button class="btn btn-outline btn-small" onclick="showGuide(false)">Open the guide</button></article></section>`;
}

const dashboardRealBeforeApplicantLabel=dashboardReal;
dashboardReal=function(){return dashboardRealBeforeApplicantLabel().replace('With an application or enrolment','Approved or completed');};

function iconFormat(format){return format==='Physical'?'⌖':format==='Hybrid'?'↔':'◉';}
function initials(name=''){return name.trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function enrollmentBadge(status){const labels={applied:'Awaiting review',waitlisted:'Waitlisted',enrolled:'Accepted',completed:'Completed'};const label=labels[status];return label?`<span class="badge enrollment-status enrollment-status-${status}" aria-label="Application status: ${label}">${label}</span>`:'';}

function programmeCardsReal(){
  const items=(state.programmes||[]).filter(p=>{
    if(role==='participant'&&page==='Discover'){
      if(!['open','ongoing'].includes(String(p.status).toLowerCase()))return false;
      if(discoverFilters.category!=='all'&&p.category!==discoverFilters.category)return false;
      if(discoverFilters.format!=='all'&&p.format!==discoverFilters.format)return false;
      if(discoverFilters.location!=='all'&&p.location!==discoverFilters.location)return false;
      const application=(state.applications||[]).find(item=>Number(item.programme_id)===Number(p.id));
      if(discoverFilters.status!=='all'&&application?.status!==discoverFilters.status)return false;
      const full=Number(p.is_full)===1||p.is_full===true||(p.enrolled_count!==null&&p.enrolled_count!==undefined&&Number(p.enrolled_count)>=Number(p.capacity||0));
      if(discoverFilters.availability==='places'&&full)return false;
      if(discoverFilters.availability==='full'&&!full)return false;
    }else if(programmeFilter!=='All'&&p.category!==programmeFilter)return false;
    return !window.programmeQuery||`${p.title} ${p.category} ${p.location} ${p.organisation_name||''}`.toLowerCase().includes(window.programmeQuery.toLowerCase());
  });
  if(!items.length)return emptyCard(role==='participant'?'No programmes available yet':'No programmes match your search',role==='participant'?'When your organisation publishes an open programme, it will appear here.':'Create a programme to begin.');
  return `<section class="grid programme-cards">${items.map(p=>{const enrolled=Number(p.enrolled_count)||0;const publicCount=role==='participant'&&p.enrolled_count!==null&&p.enrolled_count!==undefined;const full=Number(p.is_full)===1||p.is_full===true||(publicCount&&enrolled>=Number(p.capacity));const capacityLabel=role==='participant'&&!publicCount?(full?'Full':'Places available'):(full?'Full':`${Math.max(0,p.capacity-enrolled)} places available`);const publicCountLabel=publicCount?`${enrolled} enrolled · `:'';const closed=p.status==='closed'||p.status==='completed';const application=(state.applications||[]).find(a=>a.programme_id===p.id);const applied=application&&['applied','waitlisted','enrolled','completed'].includes(application.status);const sessions=role==='participant'?(state.sessionsByProgramme?.[p.id]||[]):[];const sessionSummary=sessions.length?`<div class="programme-session-summary">${sessions.length} session${sessions.length===1?'':'s'} scheduled${sessions[0]?.title?` · Next: ${esc(sessions[0].title)}`:''}</div>`:'';const image=p.image_url?`<img class="programme-cover-image" data-programme-image="${p.id}" alt="${esc(p.title)} programme image" loading="lazy">`:'';const button=role==='participant'?(applied?`${enrollmentBadge(application.status)}<button class="btn btn-outline btn-small" onclick="openProgrammeConversation(${p.id})">Message organisation</button>`:closed?'<button class="btn btn-outline btn-small" disabled>Programme closed</button>':full?`<button class="btn btn-soft btn-small" onclick="apply(${p.id})">Join waitlist</button>`:`<button class="btn btn-primary btn-small" onclick="apply(${p.id})">${p.admission_mode==='open'?'Join now':'Apply'}</button>`):`<button class="btn btn-outline btn-small" onclick="editProgrammeDetails(${p.id})" aria-label="Edit ${esc(p.title)} programme">✎ Programme</button><button class="btn btn-outline btn-small" onclick="manageProgrammeSessions(${p.id})" aria-label="Manage ${esc(p.title)} sessions">▦ Sessions ${(state.sessionsByProgramme?.[p.id]||[]).length}</button>${p.status!=='completed'?`<button class="btn btn-outline btn-small" onclick="endProgramme(${p.id})">End programme</button>`:''}`;return `<article class="card programme-card"><div class="programme-cover">${image}<span class="cover-icon">${iconFormat(p.format)}</span><span class="cover-tag">${esc(p.category)}</span></div><div class="programme-body"><h3>${esc(p.title)}</h3><p>${esc(p.description||'')}</p><div class="row-meta">${dateLabel(p.start_date)} – ${dateLabel(p.end_date)}<br>${esc(p.format)} · ${esc(p.location)}<br>Published by <b>${esc(p.organiser_name||p.organisation_name||'Organisation')}</b></div>${sessionSummary}<div class="program-foot"><span class="capacity">${publicCountLabel}${capacityLabel} · ${esc(p.status)}</span><div class="programme-actions">${button}</div></div></div></article>`;}).join('')}</section>`;
}

function usesProgrammeClasses(programme){return (programme?.activity_type||'programme')==='programme';}
const programmeCardsBeforeActivityTypes=programmeCardsReal;
programmeCardsReal=function(){
  let markup=programmeCardsBeforeActivityTypes();
  if(role!=='organiser')return markup;
  for(const programme of state.programmes||[]){
    if(usesProgrammeClasses(programme))continue;
    const sessionButton=new RegExp(`<button class="btn btn-outline btn-small" onclick="manageProgrammeSessions\\(${Number(programme.id)}\\)"[^>]*>[^<]*<\\/button>`,'g');
    markup=markup.replace(sessionButton,'');
  }
  return markup;
};

function programmesReal(){
  const categories=['All',...new Set((state.programmes||[]).map(p=>p.category).filter(Boolean))];
  const pending=(state.applications||[]).filter(a=>a.status==='applied');
  return `${head(role==='participant'?'FIND AN OPPORTUNITY':'PROGRAMME MANAGEMENT',role==='participant'?'Available programmes':'Programmes',role==='participant'?'Programmes published by your organisation.':'Create programmes and manage their sessions.',role==='organiser'?'<button class="btn btn-primary" onclick="openModal(\'new-programme\')">＋&nbsp; New programme</button>':'')}${role==='organiser'?`<article class="card" style="margin-bottom:16px"><div class="card-head"><div class="card-title">Applications to review</div><span class="badge">${pending.length}</span></div>${pending.length?pending.map(a=>`<div class="applicant"><div class="risk"><span class="mini-avatar">${initials(a.participant_name)}</span><div><b>${esc(a.participant_name)}</b><div class="row-meta">${esc(a.programme_title)} · ${esc(a.status)}</div></div></div><div class="applicant-actions"><button class="btn btn-primary btn-small" onclick="approveEnrollment(${a.id},'enrolled')">Approve</button><button class="btn btn-outline btn-small" onclick="approveEnrollment(${a.id},'waitlisted')">Waitlist</button><button class="btn btn-outline btn-small" onclick="approveEnrollment(${a.id},'rejected')">Decline</button></div></div>`).join(''):emptyCard('No applications to review','Participant applications will appear here.')}</article>`:''}<div class="toolbar"><input class="search" id="programme-search" placeholder="Search programmes" oninput="setProgrammeQuery(this.value)"><div class="filters">${categories.map(c=>`<button class="filter ${programmeFilter===c?'active':''}" onclick="setProgrammeFilter('${esc(c)}')">${esc(c)}</button>`).join('')}</div></div>${programmeCardsReal()}`;
}

function applicationReviewPanel(){
  const applications=(state.applications||[]).filter(item=>['applied','waitlisted'].includes(item.status));
  if(!applications.length)return `<section class="card application-review"><div class="card-head"><div><h2 class="card-title">Applications</h2><p class="row-meta">There are no applicants waiting for a decision.</p></div><span class="badge">0 to review</span></div></section>`;
  const groups=new Map();
  for(const item of applications){const key=Number(item.programme_id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  return `<section class="card application-review"><div class="card-head"><div><h2 class="card-title">Applications to review</h2><p class="row-meta">Approve selected applicants to grant access to programme sessions and recordings.</p></div><span class="badge orange">${applications.length} awaiting decision</span></div><label class="application-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search applicants or programmes" oninput="filterApplicationReview(this.value)"></label>${[...groups.entries()].map(([programmeId,items])=>{const programme=state.programmes.find(entry=>Number(entry.id)===programmeId);return `<section class="application-programme-group"><div class="application-programme-heading"><b>${esc(programme?.title||items[0].programme_title)}</b><span>${items.length} applicant${items.length===1?'':'s'}</span></div>${items.map(item=>`<article class="application-review-item" data-search="${esc(`${item.participant_name} ${item.participant_email||''} ${programme?.title||item.programme_title}`.toLowerCase())}"><div class="application-person"><span class="mini-avatar">${initials(item.participant_name)}</span><span><b>${esc(item.participant_name)}</b><small>${esc(item.participant_email||'Email unavailable')} · ${dateLabel(item.enrolled_at)}</small></span></div><span class="badge ${item.status==='waitlisted'?'orange':''}">${esc(item.status)}</span><div class="application-actions">${item.status==='applied'?`<button class="btn btn-primary btn-small" onclick="approveEnrollment(${item.id},'enrolled')">Approve & enrol</button><button class="btn btn-outline btn-small" onclick="approveEnrollment(${item.id},'waitlisted')">Waitlist</button>`:`<button class="btn btn-primary btn-small" onclick="approveEnrollment(${item.id},'enrolled')">Approve from waitlist</button>`}<button class="btn btn-outline btn-small" onclick="approveEnrollment(${item.id},'rejected')">Decline</button></div></article>`).join('')}</section>`;}).join('')}<div class="application-no-results" hidden>No applicants match your search.</div></section>`;
}
function filterApplicationReview(query){
  const needle=query.trim().toLowerCase();let visible=0;
  document.querySelectorAll('.application-review-item').forEach(item=>{item.hidden=!item.dataset.search.includes(needle);if(!item.hidden)visible++;});
  document.querySelectorAll('.application-programme-group').forEach(group=>group.hidden=!group.querySelector('.application-review-item:not([hidden])'));
  const empty=$('.application-no-results');if(empty)empty.hidden=visible>0;
}
function programmesWithReview(){
  if(role!=='organiser')return programmesReal();
  const categories=['All',...new Set((state.programmes||[]).map(p=>p.category).filter(Boolean))];
  return `${head('PROGRAMME MANAGEMENT','Programmes','Create programmes and review applications. Add sessions separately from each programme card.','<button class="btn btn-primary" onclick="openModal(\'new-programme\')">＋&nbsp; New programme</button>')}${applicationReviewPanel()}<div class="toolbar"><input class="search" id="programme-search" placeholder="Search programmes" oninput="setProgrammeQuery(this.value)"><div class="filters">${categories.map(c=>`<button class="filter ${programmeFilter===c?'active':''}" onclick="setProgrammeFilter('${esc(c)}')">${esc(c)}</button>`).join('')}</div></div>${programmeCardsReal()}`;
}
function setProgrammeQuery(value){window.programmeQuery=value;const list=$('.programme-cards');if(list){const parent=list.parentElement;const section=document.createElement('div');section.innerHTML=programmeCardsReal();parent.replaceChild(section.firstElementChild||document.createElement('div'),list);loadProgrammeImages(parent);}else render();}

function participantsReal(){const rows=state.people||[];return `${head('YOUR COMMUNITY','Participants','People who have applied to or joined your programmes.','<button class="btn btn-outline" onclick="downloadCsv()">Export CSV</button>')}<div class="toolbar"><input class="search" placeholder="Search participants" oninput="filterParticipants(this.value)"></div><div id="participants-list">${rows.length?`<div class="card table-card"><table class="table"><thead><tr><th>Name</th><th>Language</th><th>Area</th><th>Programmes</th><th>Attendance</th><th>Risk</th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="person-cell"><span class="mini-avatar">${initials(p.name)}</span><button class="participant-profile-link" onclick="openParticipantProfile(${p.id})">${esc(p.name)}</button></div></td><td>${esc(p.language)}</td><td>${esc(p.area||'—')}</td><td>${p.programmes}</td><td>${percent(p.attendance)}</td><td><span class="badge ${p.risk==='At risk'?'orange':''}">${esc(p.risk)}</span></td></tr>`).join('')}</tbody></table></div>`:emptyCard('No participants yet','Participants appear here after they create an account and apply to a programme.')}</div>`;}
function filterParticipants(query){document.querySelectorAll('#participants-list tbody tr').forEach(row=>row.hidden=!row.innerText.toLowerCase().includes(query.toLowerCase()));}

function attendanceReal(){const records=state.attendance||[];return `${head('SHOWING UP','Attendance','Attendance recorded against each programme session.','<button class="btn btn-outline" onclick="downloadCsv()">Export CSV</button>')}<div class="toolbar"><select class="select" id="attendance-programme" onchange="chooseAttendanceProgramme(this.value)"><option value="">All programmes</option>${(state.programmes||[]).map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select><button class="btn btn-primary btn-small" onclick="openPhysicalAttendance(document.getElementById('attendance-programme')?.value||null)">Mark physical attendance</button><span class="row-meta">Choose the specific in-person session before scanning.</span></div><div class="card table-card">${records.length?`<table class="table"><thead><tr><th>Participant</th><th>Programme</th><th>Session</th><th>Mode</th><th>Present</th><th>Recorded</th></tr></thead><tbody>${records.map(a=>`<tr><td><button class="participant-profile-link" onclick="openParticipantProfile(${a.participant_id})">${esc(a.participant_name)}</button></td><td>${esc(a.programme_title)}</td><td>${esc(a.session_title)}</td><td>${esc(a.mode)}</td><td>${percent(a.percent)}</td><td>${dateLabel(a.marked_at)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No attendance records yet. They will appear after physical check-in, live participation, or recording completion.</div>'}</div>`;}
function chooseAttendanceProgramme(id){api(`/api/attendance${id?`?programme_id=${encodeURIComponent(id)}`:''}`).then(rows=>{state.attendance=rows;render();}).catch(error=>toast(error.message));}

function participantHomeReal(){const mine=(state.enrolments||[]).filter(e=>['enrolled','completed','applied','waitlisted'].includes(e.status));const next=mine.map(e=>(state.sessionsByProgramme?.[e.programme_id]||[]).find(s=>new Date(s.scheduled_end)>new Date())).find(Boolean);return `<section class="participant-welcome-hero" style="--participant-welcome-image:url('${stockPhoto('photo-1523240795612-9a054b0db644',1200)}')"><span class="landing-eyebrow">YOUR VOXERA SPACE</span><h1>Welcome, ${esc(currentUser?.name?.split(/\s+/)[0]||'')}</h1><p>${mine.length?'Your learning journey and community are waiting for you.':'Find a place to learn, connect, and make your next move.'}</p><button class="btn btn-primary btn-small" onclick="go('${mine.length?'My Programmes':'Discover'}')">${mine.length?'View my programmes':'Explore activities'} ↗</button></section>${mine.length?`<div class="phone-hero"><div class="eyebrow">YOUR NEXT STEP</div><h2>${next?esc(next.title):'Your programme journey'}</h2><p>${next?`${esc(next.programme_title||'')} · ${dateLabel(next.scheduled_start)}`:'Check your programme for updates and sessions.'}</p><button class="btn btn-lime btn-small" onclick="go('My Programmes')">View my programmes</button></div>`:emptyCard('Your journey starts here','Explore open programmes from organisations across Voxera and apply to one that interests you.','<button class="btn btn-primary" onclick="go(\'Discover\')">Explore programmes</button>')}<div class="phone-section-title">My programmes</div>${mine.length?mine.map(e=>{const p=state.programmes.find(x=>x.id===e.programme_id);return p?`<div class="phone-card">${progRow(p,`${p.format} · ${dateLabel(p.start_date)}`,e.status)}<div class="row-meta">Published by ${esc(p.organiser_name||p.organisation_name||'the organisation')}</div></div>`:''}).join(''):emptyCard('Nothing here yet','Your applications and approved programmes will appear here.')}<div class="phone-section-title">Need help?</div><button class="btn btn-soft" style="width:100%;padding:15px" onclick="go('Speak')">Speak to Voxera</button>`;}

function participantDiscoverReal(){
  if(selectedOrganisationId!==null){
    const detail=state.organisationDetail;
    if(!detail||detail.organisation.id!==selectedOrganisationId)return `${head('ORGANISATIONS','Loading organisation','Loading its published programmes and programme history.')}<button class="btn btn-outline" onclick="closeOrganisation()">← Organisations</button>`;
    const organisation=detail.organisation;
    const programs=detail.programmes||[];
    const active=programs.filter(programme=>['open','ongoing'].includes(programme.status));
    const ended=programs.filter(programme=>programme.status==='completed');
    const shown=organisationProgrammeSection==='ended'?ended:active;
    const socialLabels={facebook:'Facebook',instagram:'Instagram',linkedin:'LinkedIn',tiktok:'TikTok',x:'X',youtube:'YouTube'};
    const links=Object.entries(organisation.social_links||{}).filter(([name,url])=>socialLabels[name]&&url).map(([name,url])=>`<a class="btn btn-outline btn-small social-profile-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${socialLabels[name]}</a>`).join('');
    const orgImage=organisation.image_url?`<img class="organisation-profile-image" src="${esc(organisation.image_url)}" alt="${esc(organisation.name)} logo">`:`<span class="organisation-profile-fallback">${esc(initials(organisation.name))}</span>`;
    const banner=organisation.banner_url?`<img src="${esc(organisation.banner_url)}" alt="" class="organisation-profile-banner">`:'<div class="organisation-profile-banner organisation-profile-banner-fallback"></div>';
      const programmeCards=shown.map(p=>{const application=(state.applications||[]).find(a=>a.programme_id===p.id);const joined=application&&['applied','waitlisted','enrolled','completed'].includes(application.status);const isEnded=p.status==='completed';const full=Number(p.is_full)===1||p.is_full===true||(p.enrolled_count!==null&&p.enrolled_count!==undefined&&Number(p.enrolled_count)>=Number(p.capacity));const action=isEnded?'<span class="badge gray">Ended · programme history</span>':joined?`${enrollmentBadge(application.status)}<button class="btn btn-outline btn-small" onclick="event.stopPropagation();openProgrammeConversation(${p.id})">Message programme team</button>`:full?`<button class="btn btn-soft btn-small" onclick="event.stopPropagation();apply(${p.id})">Join waitlist</button>`:`<button class="btn btn-primary btn-small" onclick="event.stopPropagation();apply(${p.id})">${p.admission_mode==='open'?'Join now':'Apply'}</button>`;return `<article class="card programme-card organisation-programme-card" tabindex="0" aria-label="Open ${esc(p.title)} programme sessions" onclick="openParticipantProgramme(${p.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openParticipantProgramme(${p.id})}"><div class="programme-cover">${p.image_url?`<img data-programme-image="${p.id}" alt="" loading="lazy">`:''}<span class="cover-icon">${iconFormat(p.format)}</span><span class="cover-tag">${esc(p.category)}</span></div><div class="programme-body"><h3>${esc(p.title)}</h3><p>${esc(p.description||'')}</p><div class="row-meta">${dateLabel(p.start_date)} – ${dateLabel(p.end_date)}<br>${esc(p.format)} · ${esc(p.location)}</div><div class="programme-actions">${action}</div></div></article>`;}).join('')||emptyCard(organisationProgrammeSection==='ended'?'No ended programmes':'No active programmes',organisationProgrammeSection==='ended'?'This organisation has no ended programmes in its history.':'This organisation has no programmes currently open or ongoing.');
    return `<button class="text-link" onclick="closeOrganisation()">← All organisations</button><section class="card organisation-profile-card">${banner}<div class="organisation-profile-content"><div class="organisation-profile-heading">${orgImage}<div><span class="eyebrow">ORGANISATION PROFILE</span><h1>${esc(organisation.name)}</h1><span class="badge">${esc(organisation.type)}</span></div></div><p>${esc(organisation.description||'This organisation has not added a description yet.')}</p><div class="organisation-profile-meta">${organisation.location?`<span>${lucideIcon('mapPin',15)} ${esc(organisation.location)}</span>`:''}${organisation.contact_email?`<a href="mailto:${esc(organisation.contact_email)}">Email · ${esc(organisation.contact_email)}</a>`:''}${organisation.contact_phone?`<a href="tel:${esc(organisation.contact_phone)}">Phone · ${esc(organisation.contact_phone)}</a>`:''}</div><div class="organisation-profile-links">${organisation.website_url?`<a class="btn btn-outline btn-small social-profile-link" href="${esc(organisation.website_url)}" target="_blank" rel="noopener noreferrer">Website</a>`:''}${links}</div><div class="organisation-contact-actions"><button class="btn btn-primary" onclick="openOrganisationContact(${organisation.id})">${lucideIcon('messagesSquare',17)} ${organisation.ai_first_contact?'Ask Voxera first':'Chat with organisation'}</button><button class="btn btn-outline" onclick="${organisation.ai_first_contact?`startOrganisationChat(${organisation.id})`:`openOrganisationAssistant(${organisation.id})`}">${organisation.ai_first_contact?'Message directly':'Ask Voxera instead'}</button></div></div></section>${publicGalleryMarkup(publicGallery?.albums||[])}<div class="tabs organisation-programme-tabs" role="tablist" aria-label="Organisation programmes"><button class="tab ${organisationProgrammeSection==='active'?'active':''}" role="tab" aria-selected="${organisationProgrammeSection==='active'}" onclick="setOrganisationProgrammeSection('active')">Active programmes <span>${active.length}</span></button><button class="tab ${organisationProgrammeSection==='ended'?'active':''}" role="tab" aria-selected="${organisationProgrammeSection==='ended'}" onclick="setOrganisationProgrammeSection('ended')">Ended programmes <span>${ended.length}</span></button></div><section class="grid programme-cards">${programmeCards}</section>`;
  }
  const items=state.programmes||[];
  const categories=[...new Set(items.filter(p=>['open','ongoing'].includes(String(p.status).toLowerCase())).map(p=>p.category).filter(Boolean))].sort();
  const formats=[...new Set(items.filter(p=>['open','ongoing'].includes(String(p.status).toLowerCase())).map(p=>p.format).filter(Boolean))].sort();
  const locations=[...new Set(items.filter(p=>['open','ongoing'].includes(String(p.status).toLowerCase())).map(p=>p.location).filter(Boolean))].sort();
  const discoverProgrammeIds=new Set((state.programmes||[]).filter(programme=>['open','ongoing'].includes(String(programme.status).toLowerCase())).map(programme=>Number(programme.id)));
  const myStatusCounts=(state.applications||[]).reduce((counts,item)=>{if(discoverProgrammeIds.has(Number(item.programme_id)))counts[item.status]=(counts[item.status]||0)+1;return counts;},{});
  const statusOptions=[['all','All programmes',null],['applied','Awaiting review',myStatusCounts.applied||0],['waitlisted','Waitlisted',myStatusCounts.waitlisted||0],['enrolled','Accepted',myStatusCounts.enrolled||0]];
  const controls=discoverSection==='programmes'?`<div class="toolbar discover-filters"><input class="search" placeholder="Search programmes, organisations, or areas" value="${esc(window.programmeQuery||'')}" oninput="setProgrammeQuery(this.value)"><select class="select" aria-label="Filter by category" onchange="setDiscoverFilter('category',this.value)"><option value="all">All categories</option>${categories.map(x=>`<option value="${esc(x)}" ${discoverFilters.category===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select class="select" aria-label="Filter by format" onchange="setDiscoverFilter('format',this.value)"><option value="all">All formats</option>${formats.map(x=>`<option value="${esc(x)}" ${discoverFilters.format===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select class="select" aria-label="Filter by location" onchange="setDiscoverFilter('location',this.value)"><option value="all">All locations</option>${locations.map(x=>`<option value="${esc(x)}" ${discoverFilters.location===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select class="select" aria-label="Filter by availability" onchange="setDiscoverFilter('availability',this.value)"><option value="all" ${discoverFilters.availability==='all'?'selected':''}>Any availability</option><option value="places" ${discoverFilters.availability==='places'?'selected':''}>Places available</option><option value="full" ${discoverFilters.availability==='full'?'selected':''}>Full · waitlist</option></select><select class="select" aria-label="Filter by your application status" onchange="setDiscoverFilter('status',this.value)">${statusOptions.map(([value,label,count])=>`<option value="${value}" ${discoverFilters.status===value?'selected':''}>${label}${count===null?'':` (${count})`}</option>`).join('')}</select></div><div id="discover-results">${programmeCardsReal()}</div>`:`<div class="toolbar"><input class="search" placeholder="Search organisations by name or type" value="${esc(window.programmeQuery||'')}" oninput="setProgrammeQuery(this.value)"></div><div id="discover-results">${organisationCardsDiscover()}</div>`;
  return `${head('OPPORTUNITIES','Discover','Find programmes or explore the organisations behind them.') }<div class="tabs discover-tabs"><button class="tab ${discoverSection==='programmes'?'active':''}" onclick="setDiscoverSection('programmes')">Programmes</button><button class="tab ${discoverSection==='organisations'?'active':''}" onclick="setDiscoverSection('organisations')">Organisations</button></div>${controls}`;
}

function organisationCardsDiscover(){return `<section class="grid programme-cards">${(state.organisations||[]).filter(o=>!window.programmeQuery||`${o.name} ${o.type} ${o.description||''}`.toLowerCase().includes(window.programmeQuery.toLowerCase())).map(o=>`<article class="card organisation-discovery-card">${o.image_url?`<img class="organisation-list-image" src="${esc(o.image_url)}" alt="">`:`<span class="cover-icon">${iconFormat('Hybrid')}</span>`}<button class="organisation-discovery-open" onclick="openOrganisation(${o.id})"><b>${esc(o.name)}</b><small>${esc(o.type)} · ${o.active_programmes} active · ${o.completed_programmes} ended</small></button><div class="organisation-discovery-actions"><button class="btn btn-primary btn-small" onclick="openOrganisationContact(${o.id})">${o.ai_first_contact?'Ask Voxera first':'Chat with organisation'}</button>${o.ai_first_contact?`<button class="btn btn-outline btn-small" onclick="startOrganisationChat(${o.id})">Message directly</button>`:`<button class="btn btn-outline btn-small" onclick="openOrganisationAssistant(${o.id})">Ask Voxera</button>`}</div></article>`).join('')||emptyCard('No organisations found','Try a different organisation name or type.')}</section>`;}
function setDiscoverSection(section){discoverSection=section;selectedOrganisationId=null;window.programmeQuery='';render();}
function setDiscoverFilter(name,value){discoverFilters[name]=value;render();}
async function openOrganisation(id){selectedOrganisationId=Number(id);state.organisationDetail=null;publicGallery=null;publicGalleryError='';render();try{state.organisationDetail=await api(`/api/organisations/${id}/programmes`);renderReal();await loadPublicGallery(state.organisationDetail.organisation.slug);}catch(error){selectedOrganisationId=null;render();toast(error.message);}}
function closeOrganisation(){selectedOrganisationId=null;state.organisationDetail=null;publicGallery=null;publicGalleryError='';render();}
function setOrganisationProgrammeSection(section){organisationProgrammeSection=section==='ended'?'ended':'active';renderReal();}

function myProgrammesReal(){const my=(state.enrolments||[]).filter(e=>['enrolled','completed','applied','waitlisted'].includes(e.status));return `<div class="hello">YOUR LEARNING JOURNEY</div><h1 class="phone-title">My programmes</h1>${my.length?my.map(e=>{const p=state.programmes.find(x=>x.id===e.programme_id);if(!p)return '';const sessions=state.sessionsByProgramme?.[p.id]||[];const attend=(state.attendance||[]).filter(a=>a.programme_id===p.id);return `<div class="phone-card">${progRow(p,`${p.format} · ${dateLabel(p.start_date)}`,e.status)}<div class="row-meta" style="margin-top:8px">Published by ${esc(p.organiser_name||p.organisation_name||'your organisation')} · ${esc(p.eligibility||'')}</div>${attend.length?`<div class="phone-progress"><div class="progress-row"><span>Attendance</span><b>${percent(attend.reduce((sum,a)=>sum+Number(a.percent||0),0)/attend.length)}</b></div><div class="progress lime"><i style="width:${Math.min(100,attend.reduce((sum,a)=>sum+Number(a.percent||0),0)/attend.length)}%"></i></div></div>`:''}<div class="phone-section-title">Sessions</div>${sessions.length?sessions.map(s=>{const live=s.live_state==='live';const record=live?null:attend.find(a=>a.session_id===s.id);return `<div class="session-item"><div class="session-date">${new Date(s.scheduled_start).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</div><div class="row-main"><div class="row-title">${esc(s.title)}</div><div class="row-meta">${esc(s.kind)} · ${dateLabel(s.scheduled_start)}</div></div>${record?`<span class="badge">Attended · ${esc(record.mode)}</span>`:live?`<button class="btn btn-primary btn-small" onclick="joinLiveClass(${s.id})">Join</button>`:s.recording_file?`<button class="btn btn-outline btn-small" onclick="watchRecording(${s.id})">Watch recording</button>`:`<span class="badge gray">Upcoming</span>`}</div>`;}).join(''):'<div class="empty">The organiser has not added sessions yet.</div>'}</div>`;}).join(''):`${emptyCard('No programmes yet','Apply to a programme from Discover.')}<button class="btn btn-primary" onclick="go('Discover')">Discover programmes</button>`}<div class="phone-section-title">Physical check-in code</div><div class="phone-card" style="text-align:center"><img id="participant-qr" alt="Your participant check-in QR code" style="width:132px;height:132px;margin:10px auto;display:block"><div class="row-meta">Show this personal code to your facilitator.</div></div>`;}

function loadProgrammeReviews(id){api(`/api/programmes/${id}/reviews`).then(data=>{programmeReviewData[id]=data;if(page==='Programme Detail'&&Number(participantProgrammeId)===Number(id))renderReal();}).catch(error=>{programmeReviewData[id]={error:error.message};if(page==='Programme Detail'&&Number(participantProgrammeId)===Number(id))renderReal();});}
async function saveProgrammeReview(event,id){event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;try{const result=await api(`/api/programmes/${id}/reviews`,{method:'POST',body:JSON.stringify({rating:Number(form.elements.rating.value),comment:form.elements.comment.value.trim()})});programmeReviewData[id]={...(programmeReviewData[id]||{}),...result,eligible:true,my_review:result.review,reviews:[result.review,...(programmeReviewData[id]?.reviews||[]).filter(review=>!review.mine)]};renderReal();toast('Your programme review was saved.');}catch(error){if(submit)submit.disabled=false;toast(error.message);}}
function programmeReviewsMarkup(programme){const data=programmeReviewData[programme.id];const summary=data?.average?`<b>★ ${Number(data.average).toFixed(1)}/5</b> · ${data.count} rating${data.count===1?'':'s'}`:`${data?.count||0} ratings`;const review=data?.my_review;const stars=rating=>`${'★'.repeat(Number(rating)||0)}${'☆'.repeat(5-(Number(rating)||0))}`;const reviews=(data?.reviews||[]).map(item=>`<article class="programme-review"><div><b>${esc(item.reviewer_name)}</b><span class="programme-review-stars" aria-label="${item.rating} out of 5">${stars(item.rating)}</span></div>${item.comment?`<p>${esc(item.comment)}</p>`:'<p class="row-meta">Rating only</p>'}</article>`).join('');const form=data?.eligible?`<form class="programme-review-form" onsubmit="saveProgrammeReview(event,${programme.id})"><h3>${review?'Update your rating':'Rate this programme'}</h3><label for="programme-review-rating">Rating</label><select id="programme-review-rating" name="rating" required>${[5,4,3,2,1].map(value=>`<option value="${value}" ${Number(review?.rating||5)===value?'selected':''}>${value} out of 5</option>`).join('')}</select><label for="programme-review-comment">Comment <span class="row-meta">· optional</span></label><textarea id="programme-review-comment" name="comment" rows="3" maxlength="1200" placeholder="Share what you found useful">${esc(review?.comment||'')}</textarea><button class="btn btn-primary btn-small" type="submit">${review?'Save changes':'Submit rating'}</button></form>`:!data?.error?`<div class="notice">Only participants who are enrolled in or have completed this programme can rate or comment.</div>`:'';return `<section class="programme-reviews"><div class="programme-section-head"><div><h2>Participant ratings</h2><p>${data?.error?esc(data.error):summary}</p></div></div>${!data?'<div class="row-meta" role="status">Loading programme reviews…</div>':''}${form}${reviews||''}</section>`;}
function openParticipantProgramme(id){if(participantProgrammeId!==Number(id))programmeSessionQuery='';participantProgrammeId=Number(id);page='Programme Detail';render();loadProgrammeReviews(participantProgrammeId);}
function filterProgrammeSessions(value,scope){programmeSessionQuery=value.trim().toLowerCase();const selector=scope==='participant'?'.programme-session-card':'.programme-class-card';const cards=[...document.querySelectorAll(selector)];let visible=0;for(const card of cards){const match=!programmeSessionQuery||(card.dataset.sessionSearch||'').includes(programmeSessionQuery);card.hidden=!match;if(match)visible++;}const count=document.getElementById(scope==='participant'?'programme-session-count':'programme-class-count');if(count)count.textContent=programmeSessionQuery?`${visible} of ${cards.length} sessions`:`${cards.length} session${cards.length===1?'':'s'}`;const empty=document.querySelector(scope==='participant'?'.session-search-empty':'.class-session-search-empty');if(empty)empty.hidden=visible>0;}
function programmeSessionThumbnail(session){
  const preview=session.recording_file?`<video class="programme-video-thumb" muted playsinline preload="metadata" src="/api/sessions/${session.id}/recording?token=${encodeURIComponent(authToken)}" aria-label="${esc(session.title)} recording preview"></video><span class="video-thumb-play">▶</span>`:`<div class="programme-video-placeholder"><span>${session.kind==='physical'?'⌖':'▶'}</span><small>Class video</small></div>`;
  return `<div class="programme-session-thumbnail ${session.recording_file?'has-video':''}">${preview}<span class="video-thumb-status">${session.recording_file?'Recording':'Video coming soon'}</span></div>`;
}
function participantProgrammeDetail(){
  const programme=state.programmes.find(item=>Number(item.id)===participantProgrammeId)||(state.organisationDetail?.programmes||[]).find(item=>Number(item.id)===participantProgrammeId);
  if(!programme)return `<button class="text-link" onclick="go('My Programmes')">← My programmes</button>${emptyCard('Programme not found','Return to My Programmes and choose one of your programme cards.')}`;
  const sessions=state.sessionsByProgramme?.[programme.id]||[];
  const enrollment=(state.enrolments||[]).find(item=>Number(item.programme_id)===Number(programme.id));
  const attending=enrollment&&['enrolled','completed'].includes(enrollment.status);
  const sessionCards=sessions.map(session=>{const live=session.live_state==='live';const attended=(state.attendance||[]).some(row=>row.session_id===session.id);const button=live?(attending?`<button class="btn btn-primary btn-small" onclick="joinLiveClass(${session.id})">Join live</button>`:'<span class="badge gray">Enrolment pending</span>'):session.recording_file?`<button class="btn btn-primary btn-small" onclick="watchRecording(${session.id})">Watch video</button>`:!attending?'<span class="badge gray">Enrolment pending</span>':'<span class="badge gray">Video not uploaded yet</span>';const search=`${session.title} ${session.kind} ${session.scheduled_start} ${live?'live':''} ${session.recording_file?'recording video available':'video coming soon'}`.toLowerCase();return `<article class="programme-session-card" data-session-search="${esc(search)}">${programmeSessionThumbnail(session)}<div class="programme-session-copy"><div class="session-card-meta"><span>${esc(session.kind.replaceAll('_',' '))}</span>${live?'<span class="badge red">● LIVE</span>':attended?'<span class="badge">Attended</span>':''}</div><h3>${esc(session.title)}</h3><p>${dateLabel(session.scheduled_start)} · ${new Date(session.scheduled_start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</p><div class="programme-session-controls">${button}${session.recording_file?`<button class="btn btn-outline btn-small" onclick="watchRecording(${session.id})">Comments</button>`:''}</div></div></article>`;}).join('');
  return `<button class="text-link programme-back" onclick="go('My Programmes')">← My programmes</button><div class="programme-detail-hero"><div class="eyebrow">${esc(programme.category||'PROGRAMME')}</div><h1 class="phone-title">${esc(programme.title)}</h1><p>${esc(programme.description||programme.eligibility||'Your programme sessions and class videos are collected here.')}</p><div class="row-meta">${esc(programme.format)} · ${esc(programme.location)} · ${dateLabel(programme.start_date)} – ${dateLabel(programme.end_date)}</div><span class="badge">${esc(enrollment?.status||'Programme')}</span></div><div class="programme-detail-actions"><button class="btn btn-outline btn-small" onclick="openProgrammeConversation(${programme.id})">Message programme team</button></div><div class="programme-section-head"><div><h2>Sessions & class videos</h2><p>Join a live class or watch an uploaded recording. Playback resumes where you left off.</p></div><span class="badge" id="programme-session-count">${sessions.length} session${sessions.length===1?'':'s'}</span></div>${sessions.length?`<div class="programme-session-search"><input class="search" type="search" placeholder="Search this programme’s sessions and videos" aria-label="Search programme sessions" value="${esc(programmeSessionQuery)}" oninput="filterProgrammeSessions(this.value,'participant')"><span class="row-meta">Search session titles, dates, live status, or video availability</span></div><div class="programme-session-grid">${sessionCards}</div><div class="empty session-search-empty" hidden>No sessions match your search.</div>`:emptyCard('No sessions yet','Your programme team has not added any sessions yet.')}`;
}
const participantProgrammeDetailWithoutReviews=participantProgrammeDetail;
participantProgrammeDetail=function(){const programme=state.programmes.find(item=>Number(item.id)===Number(participantProgrammeId));const html=participantProgrammeDetailWithoutReviews();const marker='<div class="programme-section-head"><div><h2>Sessions & class videos</h2>';return programme?html.replace(marker,`${programmeReviewsMarkup(programme)}${marker}`):html;};
myProgrammesReal=function(){
  const my=(state.enrolments||[]).filter(item=>['enrolled','completed','applied','waitlisted'].includes(item.status));
  return `<div class="hello">YOUR LEARNING JOURNEY</div><h1 class="phone-title">My programmes</h1><p class="page-subtitle">Open a programme to view its sessions and class videos.</p>${my.length?`<div class="my-programme-list">${my.map(enrolment=>{const programme=state.programmes.find(item=>Number(item.id)===Number(enrolment.programme_id));if(!programme)return '';const sessions=state.sessionsByProgramme?.[programme.id]||[];const recordings=sessions.filter(item=>item.recording_file).length;const cover=programme.image_url?`<img src="${esc(programme.image_url)}" alt="" class="my-programme-cover">`:`<span class="my-programme-cover-fallback">${lucideIcon('bookOpen',24)}</span>`;return `<button class="my-programme-card" onclick="openParticipantProgramme(${programme.id})">${cover}<span class="my-programme-info"><b>${esc(programme.title)}</b><small>${esc(programme.organisation_name||programme.organiser_name||'Programme team')} · ${dateLabel(programme.start_date)}</small><small>${sessions.length} session${sessions.length===1?'':'s'} · ${recordings} video${recordings===1?'':'s'} available</small></span><span class="badge">${esc(enrolment.status)}</span><span class="programme-card-arrow">›</span></button>`;}).join('')}</div>`:`${emptyCard('No programmes yet','Apply to a programme from Discover.')}<button class="btn btn-primary" onclick="go('Discover')">Discover programmes</button>`}<div class="phone-section-title">Physical check-in code</div><div class="phone-card" style="text-align:center"><img id="participant-qr" alt="Your participant check-in QR code" style="width:132px;height:132px;margin:10px auto;display:block"><div class="row-meta">Show this personal code to your facilitator.</div></div>`;
};

function organiserMessagesReal(){const convs=state.conversations||[];const contacts=(state.applications||[]).filter(a=>['applied','waitlisted','enrolled','completed'].includes(a.status));const active=convs.some(item=>item.id===selectedConversationId)?selectedConversationId:convs[0]?.id;const conv=convs.find(x=>x.id===active);const thread=state.messages||[];return `${head('IN-HOUSE MESSAGING','Messages','Message participants who have applied to or joined your programmes.')}<section class="card message-start"><div class="field"><label for="message-contact">Start a programme conversation</label><select id="message-contact"><option value="">Choose an applicant or participant</option>${contacts.map(a=>`<option value="${a.programme_id}:${a.participant_id}">${esc(a.participant_name)} · ${esc(a.programme_title)}</option>`).join('')}</select></div><button class="btn btn-primary" onclick="openOrganisationConversation()">Open conversation</button></section><div class="message-workspace"><aside class="card conversation-list"><h2 class="card-title">Inbox</h2>${convs.length?convs.map(c=>`<button class="conversation-button ${c.id===active?'active':''}" onclick="selectConversation(${c.id})"><b>${esc(c.participant_name)}</b><small>${esc(c.programme_title||'Programme conversation')} · ${esc(c.organisation_name||'')}</small></button>`).join(''):'<div class="empty">No programme conversations yet. Choose a participant above to start one.</div>'}</aside><section class="card conversation-thread"><div class="card-head"><div><div class="card-title">${esc(conv?.participant_name||'Select a conversation')}</div>${conv?`<div class="row-meta">${esc(conv.programme_title||'')} · ${esc(conv.organisation_name||'')}</div>`:''}</div><span class="badge">${conv?'Programme':'Inbox'}</span></div><div class="messages">${thread.length?thread.map(m=>`<div class="msg ${m.ai?'ai':''} ${m.mine?'mine':''}">${esc(m.text)}<span class="msg-time">${esc(m.time||'')}</span></div>`).join(''):'<div class="empty">Messages with this participant will appear here.</div>'}</div>${conv?`<div class="composer"><input id="message-input" placeholder="Write a reply" onkeydown="if(event.key==='Enter')sendMessage()"><button class="btn btn-primary" onclick="sendMessage()">Send</button></div>`:''}</section></div>`;}
async function selectConversation(id){selectedConversationId=id;conversationId=id;await loadConversation(id);render();}
async function loadConversation(id,afterId=null){const requestId=++messageLoadSequence;const cursor=afterId===null?'':`?after_id=${encodeURIComponent(afterId)}`;const existing=state.messages||[];const rows=await api(`/api/conversations/${id}/messages${cursor}`);if(requestId!==messageLoadSequence||Number(id)!==Number(conversationId))return 0;const serverMessages=rows.map(m=>({id:m.id,text:m.body,ai:!!m.ai,mine:!!m.sender_id&&m.sender_id===currentUser.id,time:new Date(m.created_at).toLocaleString()}));if(afterId===null){const serverIds=new Set(serverMessages.map(message=>message.id));const unsynced=existing.filter(message=>(message.pending||message.localSent)&&!serverIds.has(message.id));state.messages=[...serverMessages,...unsynced];}else{const knownIds=new Set(existing.map(message=>message.id));state.messages=[...existing,...serverMessages.filter(message=>!knownIds.has(message.id))];}return serverMessages.length;}
async function openProgrammeConversation(programmeId){try{const conv=await api(`/api/conversations?programme_id=${programmeId}`,{method:'POST'});selectedConversationId=conv.id;conversationId=conv.id;messageView='conversation';page='Messages';await hydrateReal();await markConversationRead(conv.id);updateMessageBadges();render();}catch(error){toast(error.message||'Could not open this programme conversation.');}}
async function openOrganisationConversation(){const choice=$('#message-contact')?.value;if(!choice)return toast('Choose a participant and programme first.');const [programmeId,participantId]=choice.split(':').map(Number);try{const conv=await api(`/api/conversations?programme_id=${programmeId}&participant_id=${participantId}`,{method:'POST'});selectedConversationId=conv.id;conversationId=conv.id;messageView='conversation';await hydrateReal();await markConversationRead(conv.id);updateMessageBadges();render();}catch(error){toast(error.message||'Could not open this participant conversation.');}}

organiserMessagesReal=function(){const convs=state.conversations||[];const contacts=(state.applications||[]).filter(a=>['applied','waitlisted','enrolled','completed'].includes(a.status));const active=convs.some(item=>item.id===selectedConversationId)?selectedConversationId:convs[0]?.id;const conv=convs.find(x=>x.id===active);const thread=state.messages||[];return `${head('VOXERA MESSAGES','Messages','Direct, private conversations with your programme participants.')}<section class="message-workspace message-workspace-pro"><aside class="conversation-list"><div class="conversation-list-heading"><div><b>Inbox</b><small>${convs.length} conversation${convs.length===1?'':'s'} · ${unreadMessageCount()} unread</small></div><span class="message-secure-mark" aria-label="Private conversations">✓</span></div><label class="conversation-search"><span aria-hidden="true">⌕</span><input placeholder="Search people or programmes" oninput="filterMessageConversations(this.value)"></label><div class="new-chat-row"><select id="message-contact" aria-label="Choose a participant"><option value="">Start a new conversation…</option>${contacts.map(a=>`<option value="${a.programme_id}:${a.participant_id}">${esc(a.participant_name)} · ${esc(a.programme_title)}</option>`).join('')}</select><button class="new-chat-button" aria-label="Open selected conversation" onclick="openOrganisationConversation()">＋</button></div><div id="organiser-conversation-items">${convs.length?convs.map(c=>`<button class="conversation-button ${c.id===active?'active':''}" onclick="selectConversation(${c.id})"><span class="chat-avatar">${esc(initials(c.participant_name))}</span><span class="conversation-copy"><span class="conversation-row"><b>${esc(c.participant_name)}</b><small>${esc(messageTime(c.last_message_at))}</small></span><small>${esc(c.programme_title||'Programme conversation')}</small><span class="conversation-last-row"><small class="conversation-preview">${messagePreview(c)}</small>${Number(c.unread_count)>0?`<span class="unread-count">${Number(c.unread_count)>99?'99+':Number(c.unread_count)}</span>`:''}</span></span></button>`).join(''):'<div class="empty">No conversations yet. Choose a participant above to get started.</div>'}</div></aside><section class="conversation-thread chat-panel">${conv?`<header class="chat-header"><span class="chat-avatar">${esc(initials(conv.participant_name))}</span><div class="chat-title"><b>${esc(conv.participant_name)}</b><small>${esc(conv.programme_title||'Programme conversation')} · ${esc(conv.organisation_name||'')}</small></div><button class="notification-toggle" onclick="enableMessageNotifications()" aria-label="Enable message notifications" title="Enable message notifications">${window.messageNotificationsEnabled?.()?'Alerts on':'Enable alerts'}</button></header><div class="chat-notice"><span class="message-secure-mark">✓</span>Private programme conversation</div><div class="messages">${thread.length?thread.map(m=>`<div class="msg ${m.ai?'ai':''} ${m.mine?'mine':''}">${esc(m.text)}<span class="msg-time">${esc(m.time||'')}${m.pending?' · Sending…':''}</span></div>`).join(''):'<div class="chat-empty"><span class="chat-empty-icon">✦</span><b>Start the conversation</b><small>Your messages with ${esc(conv.participant_name)} will appear here.</small></div>'}</div><div class="chat-compose"><input id="message-input" placeholder="Write a message…" onkeydown="if(event.key==='Enter')sendMessage()"><button class="chat-send" aria-label="Send message" onclick="sendMessage()"><span>➤</span></button></div>`:`<div class="chat-placeholder"><span class="chat-empty-icon">✦</span><b>Your messages</b><small>Select a conversation to read and reply.</small></div>`}</section></section>`;};
function conversationMessagesMarkup(messages){
  return messages.length?messages.map(message=>`<div class="msg ${message.ai?'ai':''} ${message.mine?'mine':''}">${esc(message.text)}<span class="msg-time">${esc(message.time||'')}${message.pending?' · Sending…':''}</span>${message.ai?'<span class="badge">AI message</span>':''}</div>`).join(''):'<div class="chat-empty"><span class="chat-empty-icon">✦</span><b>Start the conversation</b><small>Your messages will appear here.</small></div>';
}
function messageConversationPage(conv,participant,backHandler='backToMessageInbox'){
  const support=conv.kind==='ai_followup';
  const direct=conv.kind==='organisation';
  const title=participant?(support?'Voxera & programme team':conv.organisation_name||'Programme team'):conv.participant_name;
  const subtitle=direct?(participant?'Direct organisation chat':`Direct organisation chat · ${conv.organisation_name||''}`):participant?(support?`${conv.programme_title||'Programme'} · AI and human support`:conv.programme_title||'Programme conversation'):`${conv.programme_title||'Programme conversation'} · ${conv.organisation_name||''}`;
  const voiceDisclosure=participant&&!state.aiStatus?.voice?.available&&(window.SpeechRecognition||window.webkitSpeechRecognition)?'<small class="voice-disclosure">Browser speech can process audio with your browser provider. It is optional; typing stays private to this Voxera server.</small>':'';
  return `<div class="message-conversation-page"><button class="message-back-button" onclick="${backHandler}()">← Back to ${backHandler==='backToFollowupInbox'?'follow-up activity':'conversations'}</button><section class="conversation-thread chat-panel chat-page-panel ${participant?'participant-chat-panel':''}"><header class="chat-header"><span class="chat-avatar">${esc(initials(title))}</span><div class="chat-title"><b>${esc(title)}</b><small>${esc(subtitle)}</small></div><button class="notification-toggle" onclick="enableMessageNotifications()" aria-label="Enable message notifications">${messageNotificationsEnabled()?'Alerts on':'Enable alerts'}</button></header><div class="chat-notice"><span class="message-secure-mark">✓</span>${support?'AI support and human replies for this programme · AI messages are labelled':direct?'Private direct chat with this organisation':'Private programme conversation · AI responses are labelled'}</div>${voiceDisclosure}<div class="messages">${conversationMessagesMarkup(state.messages||[])}</div><div class="chat-compose">${participant?'<button class="chat-voice" aria-label="Record voice reply" title="Voice transcription follows the status shown in Speak" onclick="recordVoice(&quot;reply&quot;)">♬</button>':''}<input id="message-input" placeholder="Write a message…" onkeydown="if(event.key==='Enter')sendMessage()"><button class="chat-send" aria-label="Send message" onclick="sendMessage()"><span>➤</span></button></div>${participant?'<button class="talk-to-person" onclick="escalateHuman()">Need support from a person? <b>Ask the programme team</b></button>':''}</section></div>`;
}
function setOrganisationMessagesTab(tab){
  organisationMessagesTab=['chats','attention','resolved'].includes(tab)?tab:'chats';
  page='Messages';messageView='inbox';conversationId=null;state.messages=[];
  render();
}
function openSupportConversation(participantId,programmeId){
  const conversation=(state.conversations||[]).find(item=>item.kind==='ai_followup'&&Number(item.participant_id)===Number(participantId)&&Number(item.programme_id)===Number(programmeId));
  if(conversation)selectConversation(conversation.id).catch(error=>toast(error.message));
}
organiserMessagesReal=function(){
  const conversations=(state.conversations||[]).filter(item=>item.kind!=='ai_followup');
  const contacts=(state.applications||[]).filter(item=>['applied','waitlisted','enrolled','completed'].includes(item.status));
  const cases=(state.cases||[]).filter(item=>item.trigger_type!=='automated_followup_reply');
  const open=cases.filter(item=>item.status==='escalated'||item.status==='open');
  const resolved=cases.filter(item=>item.status==='ai_resolved'||item.status==='closed');
  const conversation=conversations.find(item=>Number(item.id)===Number(selectedConversationId));
  const tabs=`<div class="tabs message-section-tabs" role="tablist"><button class="tab ${organisationMessagesTab==='chats'?'active':''}" onclick="setOrganisationMessagesTab('chats')">Conversations <span class="badge">${conversations.length}</span></button><button class="tab ${organisationMessagesTab==='attention'?'active':''}" onclick="setOrganisationMessagesTab('attention')">Needs a reply <span class="badge ${open.length?'red':''}">${open.length}</span></button><button class="tab ${organisationMessagesTab==='resolved'?'active':''}" onclick="setOrganisationMessagesTab('resolved')">Handled <span class="badge">${resolved.length}</span></button></div>`;
  if(messageView==='conversation'&&conversation)return messageConversationPage(conversation,false);
  if(organisationMessagesTab==='attention'||organisationMessagesTab==='resolved'){
    const shown=organisationMessagesTab==='attention'?open:resolved;
    return `${head('VOXERA MESSAGES','Messages & support','“Needs a reply” contains open human requests. “Handled” contains AI-resolved and staff-closed requests.')}${tabs}<section class="support-case-list">${shown.length?shown.map(item=>`<article class="card support-case-card"><div class="card-head"><div><b>${esc(item.participant_name)}</b><div class="row-meta">${esc(item.programme_title||'Programme')} · ${esc(item.category.replaceAll('_',' '))} · ${dateLabel(item.created_at)}</div></div><span class="badge ${organisationMessagesTab==='attention'?(item.urgency==='Critical'?'red':item.urgency==='High'?'orange':''):'gray'}">${organisationMessagesTab==='attention'?esc(item.urgency):item.status==='closed'?'Closed by staff':'Resolved by Voxera'}</span></div><div class="support-case-content"><div><div class="eyebrow">PARTICIPANT MESSAGE</div><p>${esc(item.original_text)}</p><div class="notice"><b>AI summary</b><br>${esc(item.summary||'No summary provided.')}</div>${item.translation_en&&item.translation_en!==item.original_text?`<div class="notice"><b>English translation</b><br>${esc(item.translation_en)}</div>`:''}</div>${organisationMessagesTab==='attention'?`<div class="support-reply"><label for="case-reply-${item.id}">Reply to ${esc(item.participant_name.split(' ')[0])}</label><textarea id="case-reply-${item.id}" rows="4" placeholder="Write a clear, helpful reply…">${esc(item.suggested_reply||'')}</textarea><div class="record-controls"><button class="btn btn-primary btn-small" onclick="replyCaseId(${item.id})">Send reply</button><button class="btn btn-outline btn-small" onclick="openSupportConversation(${item.participant_id},${item.programme_id})">Open conversation</button><button class="btn btn-soft btn-small" onclick="closeCaseId(${item.id})">Mark handled</button></div></div>`:`<div class="support-reply"><div class="notice">${item.status==='closed'?'A staff member marked this request as handled.':'Voxera handled this request. The conversation remains available for follow-up.'}</div><button class="btn btn-outline btn-small" onclick="openSupportConversation(${item.participant_id},${item.programme_id})">Open conversation</button></div>`}</div></article>`).join(''):`<div class="card empty">${organisationMessagesTab==='attention'?'No requests need a reply. New requests needing staff will appear here.':'No handled requests yet. AI-resolved and staff-closed requests will be listed here.'}</div>`}</section>`;
  }
  return `${head('VOXERA MESSAGES','Messages & support','Participant chats and human follow-up, together in one workspace.')}${tabs}<section class="message-inbox-page"><aside class="conversation-list inbox-list"><div class="conversation-list-heading"><div><b>Conversations</b><small>${conversations.length} thread${conversations.length===1?'':'s'} · ${unreadMessageCount()} unread or awaiting reply</small></div><span class="message-secure-mark" aria-label="Private conversations">✓</span></div><label class="conversation-search"><span aria-hidden="true">⌕</span><input placeholder="Search people or programmes" oninput="filterMessageConversations(this.value)"></label><div class="new-chat-row"><select id="message-contact" aria-label="Choose a participant"><option value="">Start a new conversation…</option>${contacts.map(item=>`<option value="${item.programme_id}:${item.participant_id}">${esc(item.participant_name)} · ${esc(item.programme_title)}</option>`).join('')}</select><button class="new-chat-button" aria-label="Open selected conversation" onclick="openOrganisationConversation()">＋</button></div><div id="organiser-conversation-items">${conversations.length?conversations.map(item=>`<button class="conversation-button" onclick="selectConversation(${item.id})"><span class="chat-avatar">${esc(initials(item.participant_name))}</span><span class="conversation-copy"><span class="conversation-row"><b>${esc(item.participant_name)}</b><small>${esc(messageTime(item.last_message_at))}</small></span><small>${item.kind==='ai_followup'?'AI & human support · ':''}${esc(item.programme_title||'Programme conversation')}</small><span class="conversation-last-row"><small class="conversation-preview">${messagePreview(item)}</small>${Number(item.unread_count)>0?`<span class="unread-count">${Number(item.unread_count)>99?'99+':Number(item.unread_count)}</span>`:''}</span></span></button>`).join(''):'<div class="empty">No conversations yet. Choose a participant above to get started.</div>'}</div></aside></section>`;
};
function messagePreview(conversation){const preview=conversation.last_message||'Start a conversation';return esc(preview.length>54?`${preview.slice(0,51)}…`:preview);}
function messageTime(value){return value?new Date(value).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'';}
async function markConversationRead(id){if(!id||!authToken)return;try{await api(`/api/conversations/${id}/read`,{method:'POST'});state.conversations=(state.conversations||[]).map(item=>item.id===id?{...item,unread_count:0}:item);updateMessageBadges();}catch(error){console.warn('Could not mark conversation as read:',error.message);}}
async function markActiveConversationRead(){if(page!=='Messages'||messageView!=='conversation'||!conversationId)return;await markConversationRead(conversationId);render();}
async function selectConversation(id){
  const conversationIdNumber=Number(id);
  if(!Number.isInteger(conversationIdNumber)||conversationIdNumber<1)return toast('This conversation could not be opened.');
  const selectedConversation=(state.conversations||[]).find(item=>Number(item.id)===conversationIdNumber);
  if(!selectedConversation)return toast('This conversation is no longer available. Refresh your messages and try again.');
  selectedDirectConversationId=null;selectedConversationId=conversationIdNumber;conversationId=conversationIdNumber;messageView='conversation';messagesSection='chats';
  page=role==='organiser'&&selectedConversation.kind==='ai_followup'?'Follow-Up':'Messages';
  try{
    await loadConversation(conversationIdNumber);
    await markConversationRead(conversationIdNumber);
    updateMessageBadges();renderReal();
  }catch(error){
    messageView='inbox';conversationId=null;state.messages=[];
    renderReal();toast(error.message||'Could not open this conversation. Please try again.');
  }
}
function backToMessageInbox(){messageView='inbox';conversationId=null;state.messages=[];render();}
function backToFollowupInbox(){messageView='inbox';conversationId=null;state.messages=[];page='Follow-Up';renderReal();}
function prepareMessageInbox(){messageView='inbox';conversationId=null;state.messages=[];}
async function refreshConversationList(){const fresh=await api('/api/conversations');state.conversations=currentUser?.role==='participant'?fresh.filter(item=>item.kind==='programme'||item.kind==='ai_followup'||item.kind==='organisation'):fresh;updateMessageBadges();return state.conversations;}
async function filterMessageConversations(query){const target=role==='participant'?'#participant-conversation-items':'#organiser-conversation-items';document.querySelectorAll(`${target} .conversation-button`).forEach(button=>button.hidden=!button.innerText.toLowerCase().includes(query.toLowerCase()));}
function messageNotificationsEnabled(){return localStorage.getItem('voxera-message-notifications')==='true'&&('Notification'in window)&&Notification.permission==='granted';}
async function enableMessageNotifications(){if(!('Notification'in window)){toast('Browser notifications are not supported here.');return;}try{const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;if(permission!=='granted'){toast('Notifications are blocked. You can enable them in your browser settings.');return;}localStorage.setItem('voxera-message-notifications','true');toast('Message alerts are enabled on this device.');render();}catch(error){toast(`Could not enable notifications: ${error.message}`);}}
async function handleIncomingMessage(event){if(event.type!=='message'&&event.type!=='followup')return;if(event.message?.sender_id===currentUser?.id)return;try{await refreshConversationList();const active=Number(event.conversation_id)===Number(conversationId)&&page==='Messages'&&messageView==='conversation';if(active){const afterId=(state.messages||[]).reduce((max,message)=>Math.max(max,Number(message.id)||0),0);await loadConversation(conversationId,afterId);await markConversationRead(conversationId);}const conversation=(state.conversations||[]).find(item=>item.id===Number(event.conversation_id));if(!active){const title=conversation?.participant_name||conversation?.organisation_name||'Voxera';toast(`New message from ${title}.`);if(messageNotificationsEnabled()&&document.visibilityState==='hidden')new Notification(`New message from ${title}`,{body:event.message?.body||'You have a new Voxera message.',icon:'/icon.svg',tag:`voxera-message-${event.conversation_id}`});}if(page==='Messages'&&document.activeElement?.id!=='message-input')render();}catch(error){console.warn('Could not refresh message notification:',error.message);}}
window.markActiveConversationRead=markActiveConversationRead;
window.prepareMessageInbox=prepareMessageInbox;
window.messageNotificationsEnabled=messageNotificationsEnabled;
window.enableMessageNotifications=enableMessageNotifications;
window.handleIncomingMessage=handleIncomingMessage;
window.unreadMessageBadge=unreadMessageBadge;

function staffInboxReal(){const rows=state.cases||[];const open=rows.filter(c=>c.status==='escalated'||c.status==='open');const resolved=rows.filter(c=>c.status==='ai_resolved');const shown=inboxTab==='AI-resolved'?resolved:open;return `${head('HUMAN SUPPORT','Staff inbox','Review sensitive or uncertain replies. AI-handled cases remain visible for audit.')}<div class="tabs"><button class="tab ${inboxTab==='Escalated'?'active':''}" onclick="setInboxTab('Escalated')">Needs attention · ${open.length}</button><button class="tab ${inboxTab==='AI-resolved'?'active':''}" onclick="setInboxTab('AI-resolved')">AI-resolved · ${resolved.length}</button></div>${shown.length?shown.map(c=>`<article class="card case-card"><div class="card-head"><div><b>${esc(c.participant_name)}</b><div class="row-meta">${esc(c.programme_title||'No programme linked')} · ${esc(c.category)}</div></div><span class="badge ${c.urgency==='Critical'?'red':'orange'}">${esc(c.urgency)}</span></div><div class="grid split"><div><b>Original message</b><p>${esc(c.original_text)}</p><div class="notice"><b>English meaning · AI</b><br>${esc(c.translation_en||'No translation available')}</div><div class="notice"><b>AI summary</b><br>${esc(c.summary||'')}</div></div><div><label for="case-reply-${c.id}">Suggested reply · review before sending</label><textarea id="case-reply-${c.id}" rows="4">${esc(c.suggested_reply||'')}</textarea><div class="record-controls"><button class="btn btn-primary btn-small" onclick="replyCaseId(${c.id})">Send reply</button><button class="btn btn-outline btn-small" onclick="closeCaseId(${c.id})">Close case</button><button class="btn btn-soft btn-small" onclick="markAiWrong(${c.id})">AI was wrong</button></div></div></div></article>`).join(''):emptyCard(inboxTab==='AI-resolved'?'No AI-resolved cases':'No cases need attention',inboxTab==='AI-resolved'?'Routine replies handled by Voxera will be listed here.':'Sensitive and uncertain messages will be routed here.')}`;}
async function replyCaseId(id){const body=$(`#case-reply-${id}`)?.value.trim();if(!body)return toast('Write a reply first.');try{await api(`/api/cases/${id}/reply`,{method:'POST',body:JSON.stringify({body})});await hydrateReal();render();toast('Reply sent.');}catch(error){toast(error.message);}}
async function closeCaseId(id){try{await api(`/api/cases/${id}/close`,{method:'PATCH'});await hydrateReal();render();}catch(error){toast(error.message);}}
async function markAiWrong(id){try{await api(`/api/cases/${id}/ai-wrong`,{method:'POST'});toast('Feedback recorded.');}catch(error){toast(error.message);}}
async function escalateHumanReal(){
  const programmeId=activeSupportProgrammeId();
  try{
    state.voiceText='I would like to speak to a person.';
    state.voiceTranslation=state.voiceText;
    pendingSupportKind='reply';
    const result=await api('/api/cases/from-reply',{method:'POST',body:JSON.stringify({text:'I would like to speak to a person.',translation_en:'I would like to speak to a person.',language:'English',programme_id:programmeId,confirmed:true})});
    if(result.action==='choose_support_target'||result.action==='contact_staff'){state.voiceResult={...result,intent:'request_human'};render();openModal('voice-confirmed');return;}
    await hydrateReal();page='Messages';selectedConversationId=result.conversation_id;conversationId=result.conversation_id;messageView='conversation';await loadConversation(result.conversation_id);await markConversationRead(result.conversation_id);render();toast('Your request has been sent to the programme team.');
  }catch(error){toast(error.message);}
}

function outcomeReportsMarkup(reports,metrics){
  const items=(reports||[]).filter(item=>item.response);
  const total=Number(metrics.outcome_checkins)||0;
  const responded=Number(metrics.outcome_responses)||0;
  const responses=items.length?`<div class="outcome-response-list">${items.map(item=>`<article class="outcome-response"><div><b>${esc(item.programme_title)}</b><span>${esc(item.participant_name)} · ${esc(item.milestone.replaceAll('_',' '))}</span></div><p>${esc(item.response)}</p><small>${dateLabel(item.responded_at)}</small></article>`).join('')}</div>`:'<div class="empty">'+(total?'No participants have replied to their check-ins yet.':'Post-programme reflections will appear here after check-ins are sent.')+'</div>';
  return `<article class="card outcome-report-card"><div class="card-head"><div><h2 class="card-title">Programme outcomes</h2><p class="row-meta">Participant reflections from post-programme check-ins.</p></div><div class="outcome-response-rate"><b>${percent(metrics.followup_response_rate||0)}</b><span>${responded} of ${total} check-ins answered</span></div></div>${responses}</article>`;
}
function setReportSection(section){reportSection=['overview','programmes','attendance','followup'].includes(section)?section:'overview';render();}
function setReportProgrammeFilter(value){reportProgrammeFilter=value||'all';render();}
async function exportFilteredReport(){try{const response=await fetch(`/api/reports.csv${reportProgrammeFilter!=='all'?`?programme_id=${encodeURIComponent(reportProgrammeFilter)}`:''}`,{headers:{Authorization:`Bearer ${authToken}`}});if(!response.ok)throw new Error('Your account cannot export this report.');const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='voxera-report.csv';link.click();URL.revokeObjectURL(link.href);toast('Your report is ready.');}catch(error){toast(error.message);}}
function reportsReal(){
  const report=state.reports||{};const allMetrics=report.metrics||{};const allProgrammes=report.programmes||[];const selected=reportProgrammeFilter==='all'?allProgrammes:allProgrammes.filter(item=>String(item.id)===String(reportProgrammeFilter));const reasons=(report.cases_by_category||[]).filter(item=>reportProgrammeFilter==='all'||String(item.programme_id)===String(reportProgrammeFilter));const outcomes=(report.outcome_responses||[]).filter(item=>reportProgrammeFilter==='all'||String(item.programme_id)===String(reportProgrammeFilter));const enrolled=selected.reduce((sum,item)=>sum+(Number(item.enrolments)||0),0);const applicants=selected.reduce((sum,item)=>sum+(Number(item.applicants)||0),0);const waitlisted=selected.reduce((sum,item)=>sum+(Number(item.waitlisted)||0),0);const completed=selected.reduce((sum,item)=>sum+(Number(item.completed)||0),0);const attendanceCount=selected.reduce((sum,item)=>sum+(Number(item.attendance_records)||0),0);const attendance=attendanceCount?selected.reduce((sum,item)=>sum+(Number(item.attendance)||0)*(Number(item.attendance_records)||0),0)/attendanceCount:0;const responseCount=outcomes.filter(item=>item.response).length;const checkinCount=selected.reduce((sum,item)=>sum+(Number(item.outcome_checkins)||0),0);const selectedMetrics={...allMetrics,active_programmes:selected.filter(item=>['open','ongoing'].includes(String(item.status||'').toLowerCase())).length,participant_count:enrolled,applicants,waitlisted,completion_rate:enrolled?Math.round(completed*100/enrolled):0,average_attendance:attendance,certificates_issued:selected.reduce((sum,item)=>sum+(Number(item.certificates_issued)||0),0),at_risk_count:selected.reduce((sum,item)=>sum+(Number(item.at_risk_count)||0),0),outcome_checkins:checkinCount,outcome_responses:responseCount,followup_response_rate:checkinCount?Math.round(responseCount*100/checkinCount):0};const metrics=reportProgrammeFilter==='all'?allMetrics:selectedMetrics;const tabs=[['overview','Overview'],['programmes','Programmes'],['attendance','Attendance & outcomes'],['followup','Follow-up']];
  const ageTotals=new Map();const interestTotals=new Map();
  for(const programme of selected){const insight=report.participant_insights?.[String(programme.id)]||{};for(const item of insight.age_groups||[])ageTotals.set(item.age_band,(ageTotals.get(item.age_band)||0)+Number(item.count));for(const item of insight.interests||[])interestTotals.set(item.interest,(interestTotals.get(item.interest)||0)+Number(item.count));}
  const insightMarkup=`<section class="grid split"><article class="card"><div class="card-head"><div><h2 class="card-title">Age ranges</h2><p class="row-meta">Anonymous, opt-in totals. Groups under five are suppressed.</p></div><span class="badge">Private</span></div>${ageTotals.size?[...ageTotals].map(([label,count])=>`<div class="profile-option"><span>${esc(label.replaceAll('_',' ').replace('plus','+'))}</span><b>${count}</b></div>`).join(''):'<div class="empty">No reportable age-range groups yet. Participants can opt in from Profile.</div>'}</article><article class="card"><div class="card-head"><div><h2 class="card-title">Participant interests</h2><p class="row-meta">Applicants, waitlisted and enrolled participants’ interests, shown as anonymous totals.</p></div><span class="badge">Private</span></div>${interestTotals.size?[...interestTotals].sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<div class="profile-option"><span>${esc(label)}</span><b>${count}</b></div>`).join(''):'<div class="empty">No reportable interest groups yet. Participants can opt in from Profile.</div>'}</article></section>`;
  const filter=`<div class="report-controls"><label for="report-programme">Across sections</label><select id="report-programme" class="select" onchange="setReportProgrammeFilter(this.value)"><option value="all" ${reportProgrammeFilter==='all'?'selected':''}>All programmes</option>${allProgrammes.map(item=>`<option value="${item.id}" ${String(item.id)===String(reportProgrammeFilter)?'selected':''}>${esc(item.title)}</option>`).join('')}</select><button class="btn btn-outline btn-small" onclick="exportFilteredReport()">Export ${reportProgrammeFilter==='all'?'all':'selected'} data</button></div>`;
  const overview=`<section class="grid stats report-stats">${statReal('Enrolled participants',metrics.participant_count||0,'Approved or completed','♙')}${statReal('Applicants',metrics.applicants||0,'Awaiting a decision','⌛')}${statReal('Waitlisted',metrics.waitlisted||0,'Waiting for a place','◷')}${statReal('Completion rate',percent(metrics.completion_rate||0),'Completed ÷ approved enrolments','✧')}${statReal('Average attendance',percent(metrics.average_attendance||0),'Valid attendance records','◷')}</section><section class="report-insight-banner" style="--report-image:url('${stockPhoto('photo-1504384308090-c894fdcc538d',1100)}')"><div><span class="landing-eyebrow">A CLEARER VIEW OF YOUR IMPACT</span><h2>Every programme tells a story.</h2><p>Move between performance, attendance, outcomes, and follow-up. The programme filter stays consistent across every section.</p></div></section><article class="card"><h2 class="card-title">At a glance</h2><div class="report-summary-grid"><div><span>Active programmes</span><b>${Number(metrics.active_programmes)||0}</b></div><div><span>Certificates issued</span><b>${Number(metrics.certificates_issued)||0}</b></div><div><span>Participants at risk</span><b>${Number(metrics.at_risk_count)||0}</b></div><div><span>Check-in response rate</span><b>${percent(metrics.followup_response_rate||0)}</b></div></div></article>${insightMarkup}`;
  const programmeSection=`<article class="card report-panel"><div class="card-head"><div><h2 class="card-title">Programme performance</h2><p class="row-meta">${selected.length} programme${selected.length===1?'':'s'} in this view</p></div></div>${selected.length?`<div class="table-card"><table class="table"><thead><tr><th>Programme</th><th>Enrolled</th><th>Completed</th><th>Applicants</th><th>Waitlisted</th><th>Attendance</th><th>Live</th><th>Recording</th><th>Physical</th></tr></thead><tbody>${selected.map(item=>`<tr><td>${esc(item.title)}</td><td>${item.enrolments}</td><td>${item.completed??'—'}</td><td>${item.applicants}</td><td>${item.waitlisted}</td><td>${percent(item.attendance||0)}</td><td>${item.live||0}</td><td>${item.recorded||0}</td><td>${item.physical||0}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Programme results will appear here when data is available.</div>'}</article>`;
  const attendanceSection=`<section class="grid stats report-stats">${statReal('Average attendance',percent(metrics.average_attendance||0),'Across the selected programme scope','◷')}${statReal('Live participation',selected.reduce((sum,item)=>sum+(Number(item.live)||0),0),'Participants recorded live','◉')}${statReal('Recording completion',selected.reduce((sum,item)=>sum+(Number(item.recorded)||0),0),'Participants completing recordings','▷')}${statReal('Physical attendance',selected.reduce((sum,item)=>sum+(Number(item.physical)||0),0),'In-person attendance records','⌖')}</section>${outcomeReportsMarkup(outcomes,metrics)}`;
  const followupSection=`<article class="card report-panel"><div class="card-head"><div><h2 class="card-title">Follow-up categories</h2><p class="row-meta">Cases across the selected programme scope.</p></div></div>${reasons.length?reasons.map(item=>`<div class="profile-option"><span>${esc(String(item.category||'').replaceAll('_',' '))} · ${esc(item.status||'')}</span><b>${item.count}</b></div>`).join(''):'<div class="empty">No follow-up cases are recorded for this selection.</div>'}</article><article class="card report-panel"><div class="card-head"><div><h2 class="card-title">Participant reflections</h2><p class="row-meta">Post-programme check-ins for the same programme selection.</p></div><span class="badge">${metrics.followup_response_rate?percent(metrics.followup_response_rate):'0%'} response</span></div>${outcomeReportsMarkup(outcomes,metrics)}</article>`;
  const content={overview,programmes:programmeSection,attendance:attendanceSection,followup:followupSection}[reportSection];
  return `${head('MEASURED FROM REAL ACTIVITY','Reports','Explore performance, attendance, outcomes, and participant follow-up in one place.')}<section class="report-hero" style="--report-image:url('${stockPhoto('photo-1497366811353-6870744d04b2',1500)}')"><div><span class="landing-eyebrow">YOUR ORGANISATION · MEASURE WHAT MATTERS</span><h1>Insight for your next step.</h1><p>One connected view of the work happening across your organisation.</p></div></section>${filter}<nav class="report-section-tabs" aria-label="Report sections" role="tablist">${tabs.map(([key,label])=>`<button class="tab ${reportSection===key?'active':''}" role="tab" aria-selected="${reportSection===key}" onclick="setReportSection('${key}')">${label}</button>`).join('')}</nav>${content}`;
}

function settingsReal(){const s=state.settings||{};const account=state.accountProfile||{};const followup=state.followupSettings||{max_per_week:2,triggers:{}};const triggerLabels={missed_session:'Missed a session',missed_two:'Missed two sessions',recording_deadline:'Recording deadline approaching',below_threshold:'Attendance below target',outcome_checkins:'Outcome check-in due'};return `${head('YOUR WORKSPACE','Settings','Edit your personal profile, organisation details, follow-up rules, and appearance.')}<section class="grid split"><article class="card settings-profile-card"><div class="card-head"><h2 class="card-title">Your organiser profile</h2></div><div class="settings-photo-row">${accountAvatar('settings-avatar')}<label class="btn btn-outline btn-small" for="account-photo-file">Change photo<input id="account-photo-file" type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadAccountPhoto(this)" hidden></label><small>PNG, JPEG or WebP · no size limit</small></div><form onsubmit="saveAccountDetails(event)"><div class="field"><label for="account-name">Your name</label><input id="account-name" value="${esc(account.name||currentUser?.name||'')}" minlength="2" maxlength="120" required></div><div class="field"><label for="account-theme">Appearance</label><select id="account-theme" onchange="saveThemePreference(this.value)"><option value="light" ${account.theme!=='dark'?'selected':''}>Light mode</option><option value="dark" ${account.theme==='dark'?'selected':''}>Dark mode</option></select></div><button class="btn btn-primary btn-small">Save profile</button></form></article><article class="card"><div class="card-head"><h2 class="card-title">Organisation profile</h2></div><div class="settings-photo-row">${s.image_available?'<img class="settings-avatar" data-organisation-photo alt="Organisation profile picture">':'<span class="settings-avatar org-avatar-fallback">V</span>'}<label class="btn btn-outline btn-small" for="organisation-photo-file">Change organisation picture<input id="organisation-photo-file" type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadOrganisationPhoto(this)" hidden></label><small>PNG, JPEG or WebP · no size limit</small></div><form onsubmit="saveOrganisationProfile(event)"><div class="field"><label for="organisation-name">Organisation name</label><input id="organisation-name" value="${esc(s.name||'')}" minlength="2" maxlength="160" required></div><div class="field"><label for="organisation-type">Organisation type</label><input id="organisation-type" value="${esc(s.type||'')}" minlength="2" maxlength="80" required></div><label class="toggle settings-toggle"><input id="organisation-ai-first-contact" type="checkbox" ${s.ai_first_contact!==false&&Number(s.ai_first_contact)!==0?'checked':''}><span>Offer Voxera AI as the first point of contact</span></label><p class="row-meta">Participants can still choose direct chat when this is enabled.</p><label class="toggle settings-toggle"><input id="organisation-public-enrolments" type="checkbox" ${Number(s.show_enrolment_counts)===1?'checked':''}><span>Show programme enrolment counts publicly</span></label><p class="row-meta">Off by default. When enabled, public activity and organisation pages show enrolled participant totals.</p><button class="btn btn-primary btn-small">Save organisation</button></form><p class="row-meta">These details appear on programmes and participant pages.</p></article><article class="card"><h2 class="card-title">Participant follow-up</h2><p class="row-meta">Choose when Voxera sends automated follow-up messages on your organisation’s behalf.</p><form onsubmit="saveFollowupSettings(event)"><div class="field"><label for="followup-limit">Maximum messages per participant each week</label><select id="followup-limit">${[1,2,3,4,5].map(value=>`<option value="${value}" ${Number(followup.max_per_week)===value?'selected':''}>${value}</option>`).join('')}</select></div>${Object.entries(triggerLabels).map(([key,label])=>`<label class="toggle settings-toggle"><input type="checkbox" data-followup-trigger="${key}" ${followup.triggers?.[key]?'checked':''}><span>${label}</span></label>`).join('')}<button class="btn btn-primary btn-small">Save follow-up rules</button></form></article><article class="card"><h2 class="card-title">First-time guide</h2><p class="row-meta">Replay the walkthrough for programmes, sessions, applications, attendance, and reports.</p><button class="btn btn-outline" onclick="showGuide(false)">Open guide</button></article></section>`;}

async function saveAccountDetails(event){event.preventDefault();const payload={name:$('#account-name')?.value.trim()};if(role==='participant')payload.area=$('#account-area')?.value.trim()||'';try{const result=await api('/api/account/profile',{method:'PATCH',body:JSON.stringify(payload)});state.accountProfile={...state.accountProfile,...result};currentUser={...currentUser,...result};renderReal();toast('Your profile was saved.');}catch(error){toast(error.message);}}
async function saveThemePreference(theme){const previous=state.accountProfile?.theme||'light';applyTheme(theme);try{const result=await api('/api/account/profile',{method:'PATCH',body:JSON.stringify({theme})});state.accountProfile={...state.accountProfile,...result};currentUser={...currentUser,...result};toast(`${theme==='dark'?'Dark':'Light'} mode enabled.`);}catch(error){applyTheme(previous);renderReal();toast(error.message);}}
async function uploadProtectedImage(path,file){const form=new FormData();form.append('file',file);const response=await fetch(path,{method:'POST',headers:authToken?{Authorization:`Bearer ${authToken}`}:{},body:form});if(!response.ok){let message='Could not upload the image.';try{message=(await response.json()).detail||message;}catch{}throw new Error(message);}return response.json();}
async function uploadAccountPhoto(input){const file=input.files?.[0];if(!file)return;try{await uploadProtectedImage('/api/account/photo',file);state.accountProfile={...state.accountProfile,image_available:true};renderReal();toast('Your profile photo was updated.');}catch(error){toast(error.message);}finally{input.value='';}}
async function uploadOrganisationPhoto(input){const file=input.files?.[0];if(!file)return;try{await uploadProtectedImage('/api/settings/photo',file);state.settings={...state.settings,image_available:true};renderReal();toast('The organisation photo was updated.');}catch(error){toast(error.message);}finally{input.value='';}}
async function saveOrganisationProfile(event){event.preventDefault();const social_links={};for(const key of ['facebook','instagram','linkedin','tiktok','x','youtube']){const value=$(`#organisation-social-${key}`)?.value.trim();if(value)social_links[key]=value;}try{const result=await api('/api/settings',{method:'PATCH',body:JSON.stringify({name:$('#organisation-name').value.trim(),type:$('#organisation-type').value.trim(),ai_first_contact:$('#organisation-ai-first-contact').checked,show_enrolment_counts:$('#organisation-public-enrolments').checked,description:$('#organisation-description')?.value.trim()||'',website_url:$('#organisation-website')?.value.trim()||'',contact_email:$('#organisation-contact-email')?.value.trim()||'',contact_phone:$('#organisation-contact-phone')?.value.trim()||'',location:$('#organisation-location')?.value.trim()||'',social_links,profile_sections:captureOrganisationProfileSections()})});state.settings={...state.settings,...result};renderReal();toast('Organisation profile page was saved.');}catch(error){toast(error.message);}}
async function saveFollowupSettings(event){event.preventDefault();const triggers={};document.querySelectorAll('[data-followup-trigger]').forEach(input=>triggers[input.dataset.followupTrigger]=input.checked);try{const saved=await api('/api/followup/settings',{method:'PATCH',body:JSON.stringify({max_per_week:Number($('#followup-limit').value),triggers})});state.followupSettings=saved;renderReal();toast('Follow-up settings were saved.');}catch(error){toast(error.message);}}
function followupSettingsCard(){
  const settings=state.followupSettings||{automation_enabled:true,max_per_week:2,triggers:{},post_programme_interval_value:2,post_programme_interval_unit:'weeks',post_programme_limit:3};
  const labels={missed_session:'Missed a session',missed_two:'Missed two consecutive sessions',recording_deadline:'Recording deadline approaching',below_threshold:'Attendance below target',outcome_checkins:'Post-programme check-ins'};
  return `<article class="card followup-settings-card"><div class="card-head"><div><h2 class="card-title">Automation settings</h2><p class="row-meta">Messages are sent in the participant’s Voxera follow-up thread and remain subject to their consent and opt-out.</p></div><span class="badge">${settings.automation_enabled?'Automation on':'Paused'}</span></div><form onsubmit="saveFollowupAutomationSettings(event)"><label class="toggle settings-toggle"><input id="followup-automation-enabled" type="checkbox" ${settings.automation_enabled?'checked':''}><span>Enable automated follow-ups for this organisation</span></label><div class="field"><label for="followup-max-week">Maximum automated messages per participant each week</label><select id="followup-max-week">${[1,2,3,4,5].map(value=>`<option value="${value}" ${Number(settings.max_per_week)===value?'selected':''}>${value}</option>`).join('')}</select></div><fieldset class="followup-trigger-options"><legend>When to follow up</legend>${Object.entries(labels).map(([key,label])=>`<label class="toggle settings-toggle"><input type="checkbox" data-followup-trigger="${key}" ${settings.triggers?.[key]?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><div class="grid split"><div class="field"><label for="followup-interval-value">Post-programme check-in interval</label><input id="followup-interval-value" type="number" min="1" max="31" value="${Number(settings.post_programme_interval_value)||2}" required></div><div class="field"><label for="followup-interval-unit">Interval unit</label><select id="followup-interval-unit">${[['days','Days'],['weeks','Weeks'],['months','Months']].map(([value,label])=>`<option value="${value}" ${settings.post_programme_interval_unit===value?'selected':''}>${label}</option>`).join('')}</select></div></div><div class="field"><label for="followup-post-limit">Stop after</label><select id="followup-post-limit">${[1,2,3].map(value=>`<option value="${value}" ${Number(settings.post_programme_limit)===value?'selected':''}>${value} check-in${value===1?'':'s'}</option>`).join('')}</select></div><button class="btn btn-primary btn-small">Save automation settings</button></form></article>`;
}
async function saveFollowupAutomationSettings(event){
  event.preventDefault();
  const triggers={};
  document.querySelectorAll('[data-followup-trigger]').forEach(input=>triggers[input.dataset.followupTrigger]=input.checked);
  const payload={automation_enabled:$('#followup-automation-enabled').checked,max_per_week:Number($('#followup-max-week').value),triggers,post_programme_interval_value:Number($('#followup-interval-value').value),post_programme_interval_unit:$('#followup-interval-unit').value,post_programme_limit:Number($('#followup-post-limit').value)};
  try{state.followupSettings=await api('/api/followup/settings',{method:'PATCH',body:JSON.stringify(payload)});renderReal();toast('Follow-up automation settings were saved.');}
  catch(error){toast(error.message);}
}
function followupReal(){
  const deliveries=state.followupActivity||[];
  const triggerNames={missed_session:'Missed session',missed_two:'Consecutive missed sessions',recording_deadline:'Recording deadline',below_threshold:'Attendance below target',outcome_checkin:'Post-programme check-in'};
  const activeConversation=(state.conversations||[]).find(item=>Number(item.id)===Number(selectedConversationId)&&item.kind==='ai_followup');
  if(messageView==='conversation'&&activeConversation)return messageConversationPage(activeConversation,false,'backToFollowupInbox');
  const rows=deliveries.length?deliveries.map(item=>{const status=item.needs_reply?'Needs staff reply':item.reply_status==='ai_resolved'?'Voxera replied':item.reply_status==='closed'?'Staff replied':'Sent by Voxera';return `<article class="card followup-activity-row"><div class="card-head"><div><b>${esc(item.participant_name)}</b><div class="row-meta">${esc(item.programme_title)} · ${esc(triggerNames[item.trigger_type]||item.trigger_type.replaceAll('_',' '))} · ${dateLabel(item.created_at)}</div></div><span class="badge ${item.needs_reply?'orange':'gray'}">${status}</span></div>${item.participant_reply?`<div class="notice"><b>Participant reply</b><br>${esc(item.participant_reply)}</div>`:''}<p>${esc(item.last_message||'Automated follow-up sent')}</p><div class="record-controls"><button class="btn btn-outline btn-small" onclick="openSupportConversation(${item.participant_id},${item.programme_id})">Open follow-up thread</button>${item.needs_reply?'<span class="row-meta">Participant reply is waiting for your team.</span>':''}</div></article>`;}).join(''):'<div class="card empty">No automated follow-ups have been sent yet. Due messages will appear here, separately from ordinary conversations.</div>';
  return `${head('PARTICIPANT SUPPORT','Follow-Up','Configure automation, review messages sent by Voxera, and respond to participant replies.','<button class="btn btn-outline" onclick="refreshFollowupActivity()">Refresh</button><button class="btn btn-primary" onclick="runFollowupsNow()">Run due follow-ups now</button>')}${followupSettingsCard()}<section class="followup-activity"><div class="card-head"><div><h2 class="card-title">Automated follow-up activity</h2><p class="row-meta">${deliveries.length} most recent ${deliveries.length===1?'delivery':'deliveries'} · separated from Conversations</p></div></div>${rows}</section>`;
}
async function refreshFollowupActivity(){try{state.followupActivity=await api('/api/followup/activity');renderReal();}catch(error){toast(error.message);}}
async function runFollowupsNow(){
  try{const result=await api('/api/followup/run',{method:'POST'});state.followupActivity=await api('/api/followup/activity');renderReal();toast(`${result.sent} due follow-up${result.sent===1?'':'s'} sent.`);}
  catch(error){toast(error.message);}
}

function realOpenModal(type){if(type==='help'){showGuide(false);return;}if(type==='qr'){realQrModal();return;}if(type==='voice-confirmed'){const result=state.voiceResult||{};const programs=result.programmes||[];document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><section class="modal"><div class="modal-top"><div><span class="eyebrow">VOXERA ASSISTANT · AI-GENERATED</span><h2>Here’s what I understood</h2></div><button class="close" onclick="closeModal()">×</button></div><div class="notice"><b>Your message</b><br>${esc(state.voiceText)}<br><br><b>English meaning</b><br>${esc(state.voiceTranslation||state.voiceText)}</div><div class="phone-card"><b>${esc(result.assistant_text||'Please try again or type your question.')}</b>${result.intent?`<div class="row-meta" style="margin-top:8px">Intent · ${esc(result.intent.replaceAll('_',' '))}${result.status?` · ${esc(result.status)}`:''}</div>`:''}</div>${programs.map(p=>`<article class="phone-card"><b>${esc(p.title)}</b><div class="row-meta">${esc(p.organisation_name||state.settings?.name||'')} · ${esc(p.format)} ·${esc(p.location)} · ${dateLabel(p.start_date)}–${dateLabel(p.end_date)}</div><p>${esc(p.eligibility||p.description||'')}</p>${result.intent==='register'&&p.status==='open'?`<button class="btn btn-primary btn-small" onclick="assistantApply(${p.id})">Apply to this programme</button>`:''}</article>`).join('')}<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Close</button>${result.action==='contact_staff'?'<button class="btn btn-primary" onclick="closeModal();escalateHuman()">Talk to a person</button>':''}</div></section></div>`);return;}if(type==='new-programme'){document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><form class="modal" onsubmit="createProgrammeReal(event)"><div class="modal-top"><div><h2>Create a programme</h2><p>Enter the real details participants will see when you publish it.</p></div><button type="button" class="close" onclick="closeModal()">×</button></div><div class="field"><label>Programme name</label><input id="new-title" required minlength="3" maxlength="120"></div><div class="field"><label>Description</label><textarea id="new-desc" required rows="3"></textarea></div><div class="grid split"><div class="field"><label>Category</label><input id="new-category" required maxlength="80"></div><div class="field"><label>Format</label><select id="new-format"><option>Online</option><option>Physical</option><option>Hybrid</option></select></div></div><div class="grid split"><div class="field"><label>Location / meeting details</label><input id="new-location" required maxlength="160"></div><div class="field"><label>Capacity</label><input id="new-capacity" type="number" required min="1" max="10000" value="20"></div></div><div class="field"><label>Eligibility</label><textarea id="new-eligibility" rows="2" required></textarea></div><div class="grid split"><div class="field"><label>Start date</label><input id="new-start" type="date" required></div><div class="field"><label>End date</label><input id="new-end" type="date" required></div></div><div class="grid split"><div class="field"><label>Certificate threshold (%)</label><input id="new-threshold" type="number" min="1" max="100" value="70" required></div><div class="field"><label>Visibility</label><select id="new-status"><option value="open">Publish now</option><option value="draft">Save as draft</option></select></div></div><div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary">Save programme</button></div></form></div>`);return;}if(type==='register'){document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><form class="modal" onsubmit="registerAccount(event)"><div class="modal-top"><div><h2>Create participant account</h2><p>Use your real details. Consent can be changed later in Profile.</p></div><button type="button" class="close" onclick="closeModal()">×</button></div><div class="field"><label>Your name</label><input id="register-name" required minlength="2"></div><div class="field"><label>Email</label><input id="register-user" type="email" required></div><div class="field"><label>Password</label><input id="register-password" type="password" minlength="10" required></div><div class="field"><label>Preferred language</label><select id="register-language"><option>English</option><option>Pidgin</option><option>Yoruba</option><option>Hausa</option><option>Igbo</option></select></div><div class="field"><label>Community or area</label><input id="register-area" maxlength="100"></div><label class="toggle"><input type="checkbox" id="register-data" required> I agree that Voxera may use my information to provide programme services.</label><label class="toggle"><input type="checkbox" id="register-voice"> I consent to storing voice notes after transcription.</label><label class="toggle"><input type="checkbox" id="register-followup" checked> I agree to programme follow-up messages.</label><div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary">Create account</button></div></form></div>`);return;}window.__baseOpenModal(type);}

let programmeSessionDraftCount=0;
function programmeSessionDraftMarkup(index){
  return `<fieldset class="programme-session-draft"><legend>Session ${index+1}</legend><button type="button" class="session-remove" aria-label="Remove session ${index+1}" onclick="removeProgrammeSessionDraft(this)">Remove</button><div class="field"><label>Session title</label><input class="draft-session-title" required minlength="3" maxlength="120" placeholder="e.g. Welcome and introductions"></div><div class="field"><label>Session description</label><textarea class="draft-session-description" maxlength="2000" rows="2" placeholder="What will participants learn or do in this session?"></textarea></div><div class="grid split"><div class="field"><label>Session format</label><select class="draft-session-kind"><option value="live_online">Live online</option><option value="physical">In person</option></select></div><div class="field"><label>Length (minutes)</label><input class="draft-session-duration" type="number" min="15" max="600" value="60" required></div></div><div class="grid split"><div class="field"><label>Starts</label><input class="draft-session-start" type="datetime-local" required></div><div class="field"><label>Recording deadline (days)</label><input class="draft-session-deadline" type="number" min="1" max="90" value="7" required></div></div></fieldset>`;
}
function addProgrammeSessionDraft(){const container=$('#programme-session-drafts');if(!container)return;if(container.children.length>=30)return toast('A programme can have up to 30 sessions.');container.insertAdjacentHTML('beforeend',programmeSessionDraftMarkup(programmeSessionDraftCount++));}
function removeProgrammeSessionDraft(button){button.closest('.programme-session-draft')?.remove();}
function previewProgrammeImage(input){const file=input.files?.[0],preview=$('#programme-image-preview');if(!preview)return;if(!file){preview.hidden=true;preview.removeAttribute('src');return;}if(file.size>5*1024*1024){input.value='';preview.hidden=true;toast('Choose an image smaller than 5 MB.');return;}preview.src=URL.createObjectURL(file);preview.hidden=false;}
function openProgrammeBuilder(){
  programmeSessionDraftCount=0;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-back programme-builder-backdrop" onclick="if(event.target===this)closeModal()"><form class="modal programme-builder" onsubmit="createProgrammeReal(event)"><div class="modal-top"><div><span class="eyebrow">PROGRAMME SETUP</span><h2>Create a programme</h2><p>Add the public details and any scheduled sessions together. Sessions are optional and can be added later.</p></div><button type="button" class="close" onclick="closeModal()" aria-label="Close">×</button></div><section class="programme-form-section"><h3>About this programme</h3><div class="field"><label for="new-title">Programme name</label><input id="new-title" required minlength="3" maxlength="120" placeholder="e.g. Digital skills for work"></div><div class="field"><label for="new-desc">Description</label><textarea id="new-desc" required rows="3" maxlength="4000" placeholder="What will participants learn or achieve?"></textarea></div><div class="grid split"><div class="field"><label for="new-category">Category</label><input id="new-category" required maxlength="80" placeholder="Skills & employment"></div><div class="field"><label for="new-format">Format</label><select id="new-format"><option>Online</option><option>Physical</option><option>Hybrid</option></select></div></div><div class="grid split"><div class="field"><label for="new-location">Location / meeting details</label><input id="new-location" required maxlength="160" placeholder="City, venue, or online"></div><div class="field"><label for="new-capacity">Capacity</label><input id="new-capacity" type="number" required min="1" max="10000" value="20"></div></div><div class="field"><label for="new-eligibility">Eligibility</label><textarea id="new-eligibility" rows="2" required maxlength="2000" placeholder="Who can apply?"></textarea></div><div class="grid split"><div class="field"><label for="new-start">Programme starts</label><input id="new-start" type="date" required></div><div class="field"><label for="new-end">Programme ends</label><input id="new-end" type="date" required></div></div><div class="grid split"><div class="field"><label for="new-threshold">Attendance threshold (%)</label><input id="new-threshold" type="number" min="1" max="100" value="70" required></div><div class="field"><label for="new-status">Visibility</label><select id="new-status"><option value="open">Publish now</option><option value="draft">Save as draft</option></select></div></div><label class="programme-image-field"><span><b>Programme cover image</b><small>Optional · PNG, JPEG, or WebP · up to 5 MB</small></span><input id="new-image" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewProgrammeImage(this)"><img id="programme-image-preview" alt="Selected programme cover preview" hidden></label></section><section class="programme-form-section"><div class="programme-section-heading"><div><h3>Schedule sessions</h3><p>Participants will see session dates as soon as they are published.</p></div><button type="button" class="btn btn-outline btn-small" onclick="addProgrammeSessionDraft()">＋ Add session</button></div><div id="programme-session-drafts"></div></section><div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary">Save programme</button></div></form></div>`);
}
const openProgrammeBuilderWithInlineSessions=openProgrammeBuilder;
openProgrammeBuilder=function(){
  openProgrammeBuilderWithInlineSessions();
  document.querySelector('.programme-builder .programme-form-section + .programme-form-section')?.remove();
  const intro=$('.programme-builder .modal-top p');if(intro)intro.textContent='Enter the programme details first. You can add sessions separately after saving.';
};
async function createProgrammeReal(event){
  event.preventDefault();
  const start=$('#new-start').value,end=$('#new-end').value;
  if(end<start)return toast('End date must be on or after the start date.');
  const sessions=[];
  for(const [index,row] of [...document.querySelectorAll('.programme-session-draft')].entries()){
    const begins=row.querySelector('.draft-session-start').value;
    if(begins.slice(0,10)<start||begins.slice(0,10)>end)return toast(`Session ${index+1} must fall within the programme dates.`);
    const startDate=new Date(begins),duration=Number(row.querySelector('.draft-session-duration').value);
    if(Number.isNaN(startDate.valueOf())||!Number.isFinite(duration))return toast(`Enter a valid date and length for session ${index+1}.`);
    sessions.push({title:row.querySelector('.draft-session-title').value.trim(),description:row.querySelector('.draft-session-description').value.trim(),kind:row.querySelector('.draft-session-kind').value,scheduled_start:startDate.toISOString(),scheduled_end:new Date(startDate.getTime()+duration*60000).toISOString(),deadline_days:Number(row.querySelector('.draft-session-deadline').value)});
  }
  const image=$('#new-image').files?.[0];
  if(image&&image.size>5*1024*1024)return toast('Choose an image smaller than 5 MB.');
  const activityType=$('#new-activity-type')?.value||'programme';
  const body={title:$('#new-title').value.trim(),description:$('#new-desc').value.trim(),category:$('#new-category').value.trim(),format:$('#new-format').value,location:$('#new-location').value.trim(),capacity:Number($('#new-capacity').value),eligibility:$('#new-eligibility').value.trim(),start_date:start,end_date:end,status:$('#new-status').value,activity_type:activityType,admission_mode:$('#new-admission-mode')?.value||'approval',certificate_threshold:activityType==='programme'?Number($('#new-threshold').value):70,sessions};
  try{
    const programme=await api('/api/programmes',{method:'POST',body:JSON.stringify(body)});
    let imageError=null;
    if(image){
      try{
        await uploadProtectedImage(`/api/programmes/${programme.id}/image`,image);
      }catch(error){imageError=error.message;}
    }
    closeModal();await hydrateReal();go('Programmes');
    if(imageError)toast(`Programme created, but its cover image could not be uploaded: ${imageError}`);
    else toast(body.status==='open'?`Programme published${sessions.length?` with ${sessions.length} session${sessions.length===1?'':'s'}`:''}. Participants can now see the updates.`:'Programme saved as a draft.');
  }catch(error){toast(error.message);}
}

const guideContent={organiser:[{title:'Your dashboard',body:'The dashboard summarises approved participants, attendance, cases, and programme activity. These figures refresh while you are viewing the workspace.',page:'Dashboard',selector:'.stats'},{title:'Create a programme',body:'Start in Programmes. Add the details participants need, then publish it or save it as a draft. Applications appear here for your team to review.',page:'Programmes',selector:'.page-head .btn-primary'},{title:'Add sessions and class videos',body:'Open a programme card to reach Classes, then choose Manage sessions to schedule classes. Uploaded videos and saved live recordings are published from this programme page. Create a programme first if your workspace is empty.',page:'Programme Classes',selector:'.page-head .btn-primary'},{title:'Review applications',body:'New applications are listed in Programmes. Approve or decline each applicant here; only approved participants can access sessions and recordings.',page:'Programmes',selector:'.application-review'},{title:'Record attendance',body:'Use People & attendance and choose the Attendance tab to review check-ins and scan a participant or session QR code. Attendance and reports update as records arrive.',page:'Participants',selector:'.table-card'},{title:'Review reports',body:'Reports separate enrolled participants from applicants and show completion against approved enrolments. Attendance and programme activity refresh while you are viewing the workspace.',page:'Reports',selector:'.stats'},{title:'Manage settings',body:'Edit personal and organisation profiles and photos, set dark mode, configure participant follow-up rules, or replay this tour from Settings.',page:'Settings',selector:'.settings-profile-card'}],participant:[{title:'Your home',body:'Home summarises your application status and approved programme journey. Applicants and waitlisted participants cannot access classes until approved.',page:'Home',selector:'.phone-hero'},{title:'Discover and apply',body:'Discover lists published programmes. Open a programme to read its details and apply; you can follow the decision from My Programmes.',page:'Discover',selector:'.programme-cards'},{title:'Track programme access',body:'My Programmes shows each application status. Once approved, open a programme to see its sessions, live classes, and uploaded videos.',page:'My Programmes',selector:'.my-programme-list'},{title:'Messages and support',body:'Programme updates and replies appear in Messages. Ask Voxera when you need help, or request a person from your programme team.',page:'Messages',selector:'.message-inbox-page'},{title:'Profile and preferences',body:'Edit your name, area, profile photo, language, and theme. Consent and certificates are available here too.',page:'Profile',selector:'.phone-card'}]};
function showGuide(force){guideIndex=0;renderGuide();}
function renderGuide(){const steps=guideContent[role==='participant'?'participant':'organiser'];const step=steps[guideIndex];document.querySelector('.guide-backdrop')?.remove();document.querySelectorAll('.guide-highlight').forEach(element=>element.classList.remove('guide-highlight'));let targetPage=step.page;let selector=step.selector;if(role!=='participant'&&step.page==='Programme Classes'){const firstProgramme=state.programmes?.[0];if(firstProgramme)openProgrammeClasses(firstProgramme.id);else{targetPage='Programmes';selector='.page-head .btn-primary';}}else{if(step.title==='Record attendance')peopleSection='attendance';else if(step.page==='Participants')peopleSection='participants';if(page!==targetPage||step.page==='Participants'){page=targetPage;renderReal();}}const target=selector?document.querySelector(selector):null;if(target){target.classList.add('guide-highlight');target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});}document.body.insertAdjacentHTML('beforeend',`<div class="modal-back guide-backdrop" onclick="if(event.target===this)finishGuide()"><section class="modal guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title"><div class="modal-top"><div><span class="eyebrow">GETTING STARTED · ${guideIndex+1} OF ${steps.length}</span><h2 id="guide-title">${esc(step.title)}</h2><p>${esc(step.body)}</p></div><button class="close" onclick="finishGuide()" aria-label="Close guide">×</button></div><div class="guide-progress"><i style="width:${((guideIndex+1)/steps.length)*100}%"></i></div><div class="modal-actions"><button class="btn btn-outline" onclick="finishGuide()">Skip guide</button>${guideIndex?'<button class="btn btn-soft" onclick="guideBack()">Back</button>':''}<button class="btn btn-primary" onclick="guideNext()">${guideIndex===steps.length-1?'Finish':'Next'}</button></div></section></div>`);}
function guideNext(){const steps=guideContent[role==='participant'?'participant':'organiser'];if(guideIndex<steps.length-1){guideIndex++;renderGuide();}else finishGuide();}
function guideBack(){if(guideIndex>0){guideIndex--;renderGuide();}}
function finishGuide(){document.querySelector('.guide-backdrop')?.remove();document.querySelectorAll('.guide-highlight').forEach(element=>element.classList.remove('guide-highlight'));if(currentUser)localStorage.setItem(`voxera-guide-v2-${currentUser.id}`,'seen');}

let selectedDirectConversationId=null;
let participantMessagesSection='chats';
let selectedParticipantProfile=null;
let directMessageLoadSequence=0;
let participantAiChatOpen=false;
let participantAiHistoryUserId=null;
let participantAiHistoryCache=[];

function participantAiHistory(){
  const userId=String(currentUser?.id||'');
  if(!userId)return [];
  if(participantAiHistoryUserId!==userId){
    participantAiHistoryUserId=userId;
    try{
      const saved=JSON.parse(localStorage.getItem(`voxera-participant-ai-history:${userId}`)||'[]');
      participantAiHistoryCache=Array.isArray(saved)?saved.filter(item=>['participant','assistant'].includes(item.role)&&typeof item.text==='string'):[];
    }catch{participantAiHistoryCache=[];}
  }
  return participantAiHistoryCache;
}
function persistParticipantAiHistory(){
  const userId=String(currentUser?.id||'');
  if(!userId)return;
  try{localStorage.setItem(`voxera-participant-ai-history:${userId}`,JSON.stringify(participantAiHistoryCache.slice(-300)));}
  catch(error){console.warn('Could not save Voxera AI chat history in this browser:',error.message);}
}
function openParticipantMessagesSection(section){
  groupLoadSequence++;
  participantAiChatOpen=false;
  activeOrganisationAiId=null;
  selectedDirectConversationId=null;
  selectedConversationId=null;
  messageView='inbox';
  conversationId=null;
  state.messages=[];
  state.participantDirectMessages=[];
  messagesSection=section==='groups'?'groups':'chats';
  participantMessagesSection=section==='people'?'people':'chats';
  selectedGroupProgrammeId=null;state.selectedGroup=null;
  renderReal();
}
function closeParticipantMessages(){
  participantAiChatOpen=false;activeOrganisationAiId=null;selectedDirectConversationId=null;selectedConversationId=null;conversationId=null;messageView='inbox';state.messages=[];state.participantDirectMessages=[];participantMessagesSection='chats';messagesSection='chats';go('Home');
}
function backToParticipantMessageList(section='chats'){
  groupLoadSequence++;
  participantAiChatOpen=false;
  activeOrganisationAiId=null;
  selectedDirectConversationId=null;
  selectedConversationId=null;
  messageView='inbox';
  conversationId=null;
  state.messages=[];
  state.participantDirectMessages=[];
  messagesSection=section==='groups'?'groups':'chats';
  participantMessagesSection=section==='people'?'people':'chats';
  selectedGroupProgrammeId=null;state.selectedGroup=null;
  renderReal();
}
function toggleParticipantAiChat(open=true,organisationId=null){
  participantAiChatOpen=!!open;
  activeOrganisationAiId=open&&organisationId?Number(organisationId):null;
  if(open){selectedDirectConversationId=null;selectedConversationId=null;conversationId=null;messageView='inbox';messagesSection='chats';participantMessagesSection='chats';page='Messages';}
  renderReal();
}
function clearParticipantAiHistory(){
  if(!confirm('Clear your Voxera AI chat history saved in this browser?'))return;
  participantAiHistoryCache=[];
  try{localStorage.removeItem(`voxera-participant-ai-history:${currentUser?.id}`);}catch{}
  renderReal();
  toast('Voxera AI chat history cleared from this browser.');
}
async function sendParticipantAiMessage(event){
  event?.preventDefault();
  const input=$('#participant-ai-message-input'),text=input?.value.trim();
  if(!text)return;
  if(/\b(open|start|create|take me to|show me|message|chat with|contact)\b/i.test(text)){
    const normalize=value=>String(value||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
    const normalized=normalize(text);
    const matches=(state.organisations||[]).filter(item=>normalize(item.name)&&normalized.includes(normalize(item.name)));
    const history=participantAiHistory();
    history.push({role:'participant',text,created_at:new Date().toISOString()});
    if(matches.length){
      const longest=Math.max(...matches.map(item=>normalize(item.name).length));
      const best=matches.filter(item=>normalize(item.name).length===longest);
      if(best.length===1){
        history.push({role:'assistant',text:`Opening your chat with ${best[0].name}.`,created_at:new Date().toISOString()});
        participantAiHistoryCache=history.slice(-300);persistParticipantAiHistory();renderReal();
        if(await startOrganisationChat(best[0].id))return;
        history.push({role:'assistant',text:'I could not open that organisation chat. The organisation may no longer be available; try refreshing Discover.',created_at:new Date().toISOString()});
        participantAiHistoryCache=history.slice(-300);persistParticipantAiHistory();renderReal();return;
      }
      history.push({role:'assistant',text:'I found more than one matching organisation. Please choose the exact organisation from Discover so I open the right chat.',created_at:new Date().toISOString()});
    }else{
      history.push({role:'assistant',text:'I could not match that request to an organisation. Please use its full name or choose it from Discover.',created_at:new Date().toISOString()});
    }
    participantAiHistoryCache=history.slice(-300);persistParticipantAiHistory();renderReal();return;
  }
  try{
    const result=await api('/api/assistant/confirm',{method:'POST',body:JSON.stringify({text,translation_en:text,language:currentUser?.language||'English',programme_id:activeSupportProgrammeId()||undefined,organisation_id:activeOrganisationAiId||undefined,confirmed:true})});
    const history=participantAiHistory();
    history.push({role:'participant',text,created_at:new Date().toISOString()});
    history.push({role:'assistant',text:result.assistant_text||(result.status==='escalated'?'Your message was sent to the programme team.':'I could not answer that just now.'),created_at:new Date().toISOString()});
    participantAiHistoryCache=history.slice(-300);
    persistParticipantAiHistory();
    if(result.action==='choose_support_target'||(result.action==='contact_staff'&&result.support_targets?.length)){
      state.voiceText=text;state.voiceTranslation=text;state.voiceResult=result;pendingSupportKind='assistant';selectedSupportOrganisationId=activeOrganisationAiId;
    }
    renderReal();
    if(result.action==='choose_support_target'||(result.action==='contact_staff'&&result.support_targets?.length))openModal('voice-confirmed');
  }catch(error){toast(error.message||'Voxera AI could not answer right now. Your message is still in the box.');}
}

async function openParticipantProfile(participantId){
  try{
    const profile=await api(`/api/participants/${participantId}/profile`);
    selectedParticipantProfile=profile;
    const programmes=profile.programmes||[];
    const messageActions=profile.can_message&&programmes.length?programmes.map(programme=>`<button class="btn btn-outline btn-small" onclick="${currentUser.role==='participant'?`startDirectMessage(${profile.id},${programme.programme_id})`:`openOrganiserProfileConversation(${profile.id},${programme.programme_id})`}">Message · ${esc(programme.title)}</button>`).join(''):'';
    document.querySelector('.participant-profile-backdrop')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-back participant-profile-backdrop" onclick="if(event.target===this)closeParticipantProfile()"><section class="modal participant-profile-modal" role="dialog" aria-modal="true" aria-labelledby="participant-profile-title"><div class="modal-top"><div><span class="eyebrow">PARTICIPANT PROFILE</span><h2 id="participant-profile-title">${esc(profile.name)}</h2><p>${esc(profile.role)} · ${esc(profile.language||'Language not set')} · ${esc(profile.area||'Area not provided')}</p></div><button class="close" onclick="closeParticipantProfile()" aria-label="Close profile">×</button></div><div class="profile-programme-list">${programmes.length?programmes.map(programme=>`<article class="profile-programme-row"><div><b>${esc(programme.title)}</b><span class="badge ${programme.status==='applied'||programme.status==='waitlisted'?'orange':''}">${esc(programme.status)}</span></div><div class="profile-progress-grid"><span>Attendance <b>${Number(programme.attendance_percent).toFixed(1)}%</b></span><span>Video progress <b>${Number(programme.progress_percent).toFixed(1)}%</b></span></div><div class="profile-progress-track" role="img" aria-label="Attendance ${Number(programme.attendance_percent).toFixed(1)} percent"><i style="width:${Math.min(100,Math.max(0,Number(programme.attendance_percent)||0))}%"></i></div></article>`).join(''):'<div class="empty">No programmes in your shared workspace scope.</div>'}</div>${messageActions?`<div class="profile-message-actions"><b>Start a private message</b><p class="row-meta">Messages are limited to a programme you share.</p>${messageActions}</div>`:''}</section></div>`);
  }catch(error){toast(error.message||'Could not open this participant profile.');}
}
function closeParticipantProfile(){document.querySelector('.participant-profile-backdrop')?.remove();selectedParticipantProfile=null;}
async function openOrganiserProfileConversation(participantId,programmeId){
  try{
    const conversation=await api(`/api/conversations?programme_id=${encodeURIComponent(programmeId)}&participant_id=${encodeURIComponent(participantId)}`,{method:'POST'});
    closeParticipantProfile();selectedConversationId=conversation.id;conversationId=conversation.id;messageView='conversation';page='Messages';
    await hydrateReal();await loadConversation(conversation.id);renderReal();
  }catch(error){toast(error.message||'Could not open this participant conversation.');}
}
async function startDirectMessage(participantId,programmeId){
  try{
    const conversation=await api(`/api/participant/direct-conversations?participant_id=${encodeURIComponent(participantId)}&programme_id=${encodeURIComponent(programmeId)}`,{method:'POST'});
    closeParticipantProfile();
    await hydrateReal();
    await openParticipantDirectConversation(conversation.id);
  }catch(error){toast(error.message||'Could not open a private message.');}
}
async function openParticipantDirectConversation(id){
  const conversationIdNumber=Number(id);
  if(!Number.isInteger(conversationIdNumber)||conversationIdNumber<1)return toast('This private conversation could not be opened.');
  groupLoadSequence++;
  participantAiChatOpen=false;activeOrganisationAiId=null;
  selectedConversationId=null;conversationId=null;messageView='inbox';
  selectedDirectConversationId=conversationIdNumber;
  messagesSection='chats';participantMessagesSection='people';
  selectedGroupProgrammeId=null;state.selectedGroup=null;
  state.groupMessages=[];state.groupMembers=[];state.messages=[];
  page='Messages';
  await loadParticipantDirectMessages(conversationIdNumber);
  renderReal();
}
async function loadParticipantDirectMessages(conversationId,silent=false){
  const requestId=++directMessageLoadSequence;
  try{
    const rows=await api(`/api/participant/direct-conversations/${conversationId}/messages`);
    if(requestId!==directMessageLoadSequence||Number(conversationId)!==Number(selectedDirectConversationId))return;
    state.participantDirectMessages=rows;
    const area=$('#participant-direct-message-list');
    if(area){area.innerHTML=rows.map(message=>`<div class="msg ${Number(message.sender_id)===Number(currentUser.id)?'mine':''}">${esc(message.body)}<span class="msg-time">${esc(message.sender_name)} · ${esc(new Date(message.created_at).toLocaleString())}</span></div>`).join('')||'<div class="empty">Start the conversation with a message.</div>';area.scrollTop=area.scrollHeight;}
  }catch(error){if(!silent)toast(error.message||'Could not load direct messages.');}
}
async function sendParticipantDirectMessage(){
  const input=$('#participant-direct-message-input'),body=input?.value.trim();
  if(!body||!selectedDirectConversationId)return;
  const conversationId=selectedDirectConversationId;
  try{
    await api(`/api/participant/direct-conversations/${conversationId}/messages`,{method:'POST',body:JSON.stringify({body})});
    input.value='';await loadParticipantDirectMessages(conversationId);await hydrateReal();
  }catch(error){toast(error.message||'Could not send this message. Your draft has been kept.');}
}
function participantDirectThread(){
  const conversation=(state.participantDirectConversations||[]).find(item=>Number(item.id)===Number(selectedDirectConversationId));
  if(!conversation)return '';
  return `<section class="participant-direct-thread"><header><p>${esc(conversation.programme_title)} · Private participant conversation</p></header><div id="participant-direct-message-list" class="messages">${(state.participantDirectMessages||[]).map(message=>`<div class="msg ${Number(message.sender_id)===Number(currentUser.id)?'mine':''}">${esc(message.body)}<span class="msg-time">${esc(message.sender_name)} · ${esc(new Date(message.created_at).toLocaleString())}</span></div>`).join('')||'<div class="empty">Start the conversation with a message.</div>'}</div><form class="composer" onsubmit="event.preventDefault();sendParticipantDirectMessage()"><input id="participant-direct-message-input" type="text" maxlength="4000" aria-label="Write a private message" placeholder="Write a private message"><button class="btn btn-primary" type="submit">Send</button></form></section>`;
}
function participantPeerDirectory(){
  const peers=state.participantPeers||[];
  return `<section class="participant-peer-directory"><div class="card-head"><div><h2 class="card-title">People in your programmes</h2><p class="row-meta">Only approved participants who share a programme with you are listed.</p></div></div>${peers.length?peers.map(peer=>`<article class="participant-peer-row"><button class="chat-avatar profile-avatar-button" onclick="openParticipantProfile(${peer.id})" aria-label="View ${esc(peer.name)}'s profile">${esc(initials(peer.name))}</button><div><button class="participant-profile-link" onclick="openParticipantProfile(${peer.id})">${esc(peer.name)}</button><small>${esc(peer.language||'')} · ${esc(peer.area||'')}</small><div class="peer-programme-actions">${peer.programmes.map(programme=>`<button class="btn btn-outline btn-small" onclick="startDirectMessage(${peer.id},${programme.id})">Message · ${esc(programme.title)}</button>`).join('')}</div></div></article>`).join(''):'<div class="empty">Participants in your approved programmes will appear here.</div>'}</section>`;
}
function openOrganisationAssistant(organisationId){
  toggleParticipantAiChat(true,organisationId);
}
realParticipantMessages=function(){
  const conversations=(state.conversations||[]).filter(item=>item.kind==='programme'||item.kind==='ai_followup'||item.kind==='organisation');
  const selectedConversation=conversations.find(item=>Number(item.id)===Number(selectedConversationId));
  const direct=(state.participantDirectConversations||[]);
  let title='Messages',content='',backSection='chats',detail=false;
  if(participantAiChatOpen){
    title='Voxera AI';detail=true;
    const history=participantAiHistory();
    const organisation=(state.organisations||[]).find(item=>Number(item.id)===Number(activeOrganisationAiId));
    content=`<section class="participant-ai-chat" aria-label="Voxera AI conversation">${organisation?`<div class="participant-ai-context">Asking Voxera about ${esc(organisation.name)}. You can still ask general questions here.</div>`:''}<div class="participant-ai-history" id="participant-ai-history">${history.map(message=>`<article class="participant-ai-message ${message.role==='assistant'?'assistant':'participant'}"><div>${esc(message.text)}</div><small>${message.role==='assistant'?'Voxera AI':'You'}${message.created_at?` · ${esc(new Date(message.created_at).toLocaleString())}`:''}</small></article>`).join('')||'<div class="participant-ai-empty"><span>✦</span><b>Ask Voxera anything</b><p>Ask general questions, get help with maths or learning, or ask about programmes and your account.</p></div>'}</div><form class="participant-ai-compose" onsubmit="sendParticipantAiMessage(event)"><textarea id="participant-ai-message-input" maxlength="4000" rows="1" aria-label="Write a message to Voxera AI" placeholder="${organisation?`Ask about ${esc(organisation.name)} or anything else…`:'Type your question for Voxera…'}" required></textarea><button class="participant-ai-send" aria-label="Send to Voxera AI">${lucideIcon('send',18)}</button></form></section>`;
  }else if(selectedDirectConversationId){
    title=(direct.find(item=>Number(item.id)===Number(selectedDirectConversationId))||{}).peer_name||'Private chat';
    detail=true;backSection='people';content=participantDirectThread();
  }else if(messageView==='conversation'&&selectedConversation){
    title=selectedConversation.kind==='ai_followup'?'Voxera & team support':selectedConversation.organisation_name||'Programme team';
    detail=true;content=messageConversationPage(selectedConversation,true);
  }else if(messagesSection==='groups'&&selectedGroupProgrammeId){
    const group=(state.groups||[]).find(item=>Number(item.programme_id)===Number(selectedGroupProgrammeId));
    title=group?.programme_title||'Programme group';detail=true;backSection='groups';
    const sessions=state.sessionsByProgramme?.[group?.programme_id]||[];
    const sessionDescriptions=sessions.map(session=>`<article class="participant-group-session"><b>${esc(session.title)}</b><small>${esc(session.kind.replaceAll('_',' '))} · ${dateLabel(session.scheduled_start)}</small>${session.description?`<p>${esc(session.description)}</p>`:''}</article>`).join('');
    content=group?`<section class="participant-group-thread"><header class="participant-group-chat-header"><span class="group-list-avatar">#</span><div><h2>${esc(group.programme_title)}</h2><small>${group.member_count} approved participants · ${group.admin_only?'Only admins can post':'Everyone can post'}</small></div><button class="btn btn-outline btn-small" onclick="toggleGroupMembers()">Members</button></header>${sessionDescriptions?`<details class="participant-group-schedule"><summary>Session schedule & descriptions <span>${sessions.length}</span></summary><div>${sessionDescriptions}</div></details>`:''}${group.admin_only?'<div class="group-announcement">Admin-only posting is on. Everyone in the group can read messages.</div>':''}<div class="participant-group-layout"><div class="group-messages" id="group-messages">${groupMessageRows(group.programme_id,state.groupMessages||[])}</div><aside class="group-member-list" id="group-member-list"><h3>Approved members</h3>${groupMemberRows(group.programme_id,state.groupMembers||[])}</aside></div>${groupAdminTools(group,state.groupMembers||[])}<form class="group-compose" onsubmit="sendProgrammeGroupMessage(event,${group.programme_id})"><textarea id="group-message-input" maxlength="4000" aria-label="Write to everyone in this group" placeholder="${group.admin_only&&!group.is_admin?'Admins are the only people who can send messages':'Write to everyone in this group'}" ${group.admin_only&&!group.is_admin?'disabled':''} required></textarea><button class="btn btn-primary" ${group.admin_only&&!group.is_admin?'disabled':''}>Send</button></form></section>`:'<div class="empty">This group is no longer available to your account.</div>';
  }else if(messagesSection==='groups'){
    const groups=state.groups||[];
    title='Programme groups';backSection='groups';
    content=`<div class="participant-message-list-heading"><div><h2>Programme groups</h2><p>Browse group conversations for programmes you have joined.</p></div><span class="badge">${groups.length}</span></div><div class="participant-message-list">${groups.length?groups.map(group=>`<button class="participant-message-row" onclick="openProgrammeGroup(${group.programme_id})"><span class="group-list-avatar">#</span><span><b>${esc(group.programme_title)}</b><small>${group.member_count} approved participants · ${group.admin_only?'Admins only':'Everyone can post'}</small><small>${esc(group.last_message||'Start the group conversation')}</small></span><span aria-hidden="true">›</span></button>`).join(''):'<div class="participant-message-empty"><b>No programme groups yet</b><p>Groups appear here after your programme enrolment is approved.</p></div>'}</div>`;
  }else if(participantMessagesSection==='people'){
    title='People';
    content=`<div class="participant-message-list-heading"><div><h2>Private chats</h2><p>Connect with approved participants who share a programme with you.</p></div></div>${direct.length?`<div class="participant-message-list">${direct.map(item=>`<button class="participant-message-row" onclick="openParticipantDirectConversation(${Number(item.id)})"><span class="chat-avatar">${esc(initials(item.peer_name))}</span><span><b>${esc(item.peer_name)}</b><small>${esc(item.programme_title)}</small><small>${esc(item.last_message||'No messages yet')}</small></span>${Number(item.unread_count)>0?`<span class="unread-count">${Number(item.unread_count)}</span>`:'<span aria-hidden="true">›</span>'}</button>`).join('')}</div>`:'<div class="participant-message-empty">You have no private chats yet.</div>'}${participantPeerDirectory()}`;
  }else{
    const list=conversations.length?conversations.map(item=>`<button class="participant-message-row" onclick="selectConversation(${Number(item.id)})"><span class="chat-avatar">${esc(initials(item.kind==='ai_followup'?'Voxera':item.organisation_name||'Programme'))}</span><span><b>${item.kind==='ai_followup'?'Voxera & team support':esc(item.organisation_name||'Programme team')}</b><small>${item.kind==='organisation'?'Direct organisation chat':esc(item.programme_title||'Programme conversation')}</small><small>${esc(messagePreview(item))}</small></span>${Number(item.unread_count)>0?`<span class="unread-count">${Number(item.unread_count)>99?'99+':Number(item.unread_count)}</span>`:'<span aria-hidden="true">›</span>'}</button>`).join(''):'<div class="participant-message-empty">Your organisation and programme conversations will appear here after you apply to a programme.</div>';
    const organisations=state.organisations||[];
    content=`<div class="participant-message-list-heading"><div><h2>Organisation conversations</h2><p>Message any organisation directly, or ask Voxera first where that option is enabled.</p></div><span class="badge">${conversations.length}</span></div><div class="participant-message-list">${list}</div>${organisations.length?`<section class="participant-organisation-assistants"><div class="participant-message-list-heading"><div><h2>Contact an organisation</h2><p>Choose whether to start a direct chat or ask Voxera first.</p></div></div>${organisations.map(organisation=>`<article class="participant-message-row organisation-contact-row"><span class="chat-avatar">${esc(initials(organisation.name))}</span><span><b>${esc(organisation.name)}</b><small>${organisation.ai_first_contact?'Voxera is the first point of contact':'Direct organisation chat is the first option'}</small></span><span class="organisation-contact-buttons"><button class="btn btn-primary btn-small" onclick="openOrganisationContact(${Number(organisation.id)})">${organisation.ai_first_contact?'Ask Voxera first':'Chat'}</button><button class="btn btn-outline btn-small" onclick="${organisation.ai_first_contact?`startOrganisationChat(${Number(organisation.id)})`:`openOrganisationAssistant(${Number(organisation.id)})`}">${organisation.ai_first_contact?'Direct chat':'Ask Voxera'}</button></span></article>`).join('')}</section>`:''}`;
  }
  const sections=detail?'':`<nav class="participant-message-tabs" aria-label="Message type"><button class="${messagesSection!=='groups'&&participantMessagesSection!=='people'?'active':''}" onclick="openParticipantMessagesSection('chats')">Organisations</button><button class="${participantMessagesSection==='people'?'active':''}" onclick="openParticipantMessagesSection('people')">People</button><button class="${messagesSection==='groups'?'active':''}" onclick="openParticipantMessagesSection('groups')">Groups <span>${(state.groups||[]).length}</span></button></nav>`;
  const back=detail?`<button class="participant-message-back" onclick="${participantAiChatOpen?'toggleParticipantAiChat(false)':`backToParticipantMessageList('${backSection}')`}">← ${participantAiChatOpen?'Back to messages':'Messages'}</button>`:'<button class="participant-message-back" onclick="closeParticipantMessages()">← Voxera</button>';
  const actions=`${participantAiChatOpen?'<button class="participant-ai-clear" onclick="clearParticipantAiHistory()">Clear history</button>':''}<button class="participant-message-close" onclick="closeParticipantMessages()">Close</button>`;
  const fab=detail?'':`<button class="participant-ai-fab" onclick="toggleParticipantAiChat(true)" aria-label="Open Voxera AI chat"><span>${lucideIcon('sparkles',20)}</span><b>Voxera AI</b></button>`;
  return `<main class="participant-messages-page ${detail?'is-detail':''}"><header class="participant-messages-header"><div class="participant-message-heading">${back}<h1>${esc(title)}</h1></div>${actions}</header>${sections}<div class="participant-messages-content">${content}</div>${fab}</main>`;
};

function participantInsightsMarkup(){
  const storedInterests=JSON.parse(state.profile?.interests||'[]');
  const interests=Array.isArray(storedInterests)?storedInterests:[];
  const consent=!!state.profile?.consent_demographics;
  const options=['Education','Employment','Health and wellbeing','Sports and fitness','Arts and culture','Community development','Technology','Environment','Financial skills','Youth activities','Other'];
  return `<div class="phone-section-title">Optional programme insights</div><form class="phone-card" onsubmit="saveParticipantInsights(event)"><p class="row-meta">Voxera can use your voluntary adult age range and interests to show organisations private, anonymous demand summaries. Only totals for groups of five or more are shown. Your details are never shown to an organisation.</p><label class="toggle"><input id="insights-consent" type="checkbox" ${consent?'checked':''} onchange="document.getElementById('participant-insight-fields').disabled=!this.checked"><span>Allow anonymous age-range and interest totals</span></label><fieldset id="participant-insight-fields" ${consent?'':'disabled'}><div class="field"><label for="insights-age-band">Age range (optional)</label><select id="insights-age-band"><option value="">Prefer not to say</option>${[['18_24','18–24'],['25_34','25–34'],['35_44','35–44'],['45_54','45–54'],['55_plus','55+']].map(([value,label])=>`<option value="${value}" ${state.profile?.age_band===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><span class="field-label">What are you interested in?</span><div class="grid">${options.map(label=>`<label class="toggle"><input type="checkbox" name="insights-interest" value="${esc(label.toLowerCase())}" ${interests.includes(label.toLowerCase())?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div></div></fieldset><button class="btn btn-primary btn-small">Save insight preferences</button></form>`;
}
async function saveParticipantInsights(event){
  event.preventDefault();
  const payload={consent:$('#insights-consent').checked,age_band:$('#insights-age-band')?.value||null,interests:[...document.querySelectorAll('input[name="insights-interest"]:checked')].map(input=>input.value)};
  try{const result=await api('/api/profile/insights',{method:'PATCH',body:JSON.stringify(payload)});state.profile={...state.profile,consent_demographics:result.consent?1:0,age_band:result.age_band,interests:JSON.stringify(result.interests)};renderReal();toast('Your optional insight preferences were saved.');}
  catch(error){toast(error.message);}
}
function profileReal(){const certs=state.certificates||[];const account=state.accountProfile||{};return `<div class="hello">YOUR SPACE</div><h1 class="phone-title">Profile</h1><div class="phone-card"><div class="profile-head">${accountAvatar('profile-big')}<div><div class="row-title">${esc(currentUser?.name||'')}</div><div class="row-meta">${esc(currentUser?.area||'')} · Participant</div></div><label class="btn btn-outline btn-small" for="account-photo-file">Change photo<input id="account-photo-file" type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadAccountPhoto(this)" hidden></label></div></div><div class="phone-section-title">Personal details</div><form class="phone-card" onsubmit="saveAccountDetails(event)"><div class="field"><label for="account-name">Your name</label><input id="account-name" value="${esc(account.name||currentUser?.name||'')}" minlength="2" maxlength="120" required></div><div class="field"><label for="account-area">Community or area</label><input id="account-area" value="${esc(account.area||currentUser?.area||'')}" maxlength="100"></div><button class="btn btn-primary btn-small">Save personal details</button></form><div class="phone-section-title">Preferences and consent</div><div class="phone-card"><div class="profile-option"><span>Preferred language</span><select class="select" id="language-select" onchange="savePreferences()">${['English','Pidgin','Yoruba','Hausa','Igbo'].map(x=>`<option ${currentUser?.language===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="profile-option"><span>Appearance</span><select class="select" id="account-theme" onchange="saveThemePreference(this.value)"><option value="light" ${account.theme!=='dark'?'selected':''}>Light mode</option><option value="dark" ${account.theme==='dark'?'selected':''}>Dark mode</option></select></div><div class="profile-option"><span>Store voice notes after transcription</span><input id="consent-voice" class="switch" type="checkbox" ${state.profile?.consent_voice?'checked':''} onchange="saveConsent()"></div><div class="profile-option"><span>Allow external AI for text answers</span><input id="consent-remote-ai" class="switch" type="checkbox" ${state.profile?.consent_remote_ai?'checked':''} onchange="saveConsent()"></div><div class="profile-option"><span>Receive programme follow-up</span><input id="consent-followup" class="switch" type="checkbox" ${state.profile?.consent_followup?'checked':''} onchange="saveConsent()"></div><p class="row-meta">When voice storage is off, audio is deleted after transcription. If enabled, confirmed text and your programme enrolments, session times, attendance summaries, recording progress, and certificates may be sent to the operator-configured provider. Passwords and voice audio are never sent to that AI provider.</p></div>${participantInsightsMarkup()}<div class="phone-section-title">Certificates</div>${certs.length?certs.map(c=>`<article class="cert"><h3>${esc(c.programme_title)}</h3><p>Issued${dateLabel(c.issued_at)}</p><img src="/api/certificates/${encodeURIComponent(c.code)}/qr" alt="Certificate verification QR" width="120"><a class="text-link" href="/verify/${encodeURIComponent(c.code)}">Verify certificate</a></article>`).join(''):emptyCard('No certificates yet','Certificates appear here once you complete an eligible programme.')}<div class="phone-section-title">Need help?</div><button class="btn btn-outline" onclick="showGuide(false)">Replay the getting started guide</button>`;}
const profileWithoutAttendanceQr=profileReal;
profileReal=function(){return profileWithoutAttendanceQr()+'<div class="phone-section-title">Your participant check-in code</div><div class="phone-card" style="text-align:center"><img id="participant-qr" alt="Participant check-in QR code" style="width:132px;height:132px;margin:10px auto;display:block"><div class="row-meta">Show this personal QR to your facilitator, or scan an in-person session QR.</div></div>';};

async function sendMessageReal(){authToken=localStorage.getItem('voxera-token')||authToken;const input=$('#message-input');const body=input?.value.trim();if(!body)return;if(!authToken||!currentUser?.id)return toast('Your sign-in could not be verified. Please sign out and sign back in.');conversationId=selectedConversationId||conversationId;if(!conversationId)return toast('Open a programme conversation before sending a message.');if(!navigator.onLine){try{await queueMessage(conversationId,body);state.messages.push({text:body,mine:true,pending:true,time:'Waiting to send'});render();toast('Message queued to send when you reconnect.');}catch(error){toast(error.message||'Could not queue this message.');}return;}const conversation=conversationId;const pendingId=`pending-${Date.now()}`;const pending={id:pendingId,text:body,mine:true,pending:true,time:'Sending…'};state.messages=[...(state.messages||[]),pending];input.value='';render();try{const saved=await api(`/api/conversations/${conversation}/messages`,{method:'POST',body:JSON.stringify({body,language:currentUser.language||'English'})});messageLoadSequence++;state.messages=state.messages.filter(message=>message.id!==pendingId);state.messages.push({id:saved.id,text:saved.body,ai:!!saved.ai,mine:true,localSent:true,time:new Date(saved.created_at).toLocaleString()});render();}catch(error){state.messages=state.messages.filter(message=>message.id!==pendingId);if(/sign in|account not found|token/i.test(error.message)){authToken='';currentUser=null;localStorage.removeItem('voxera-token');render();toast('Your sign-in expired. Please sign in again before messaging.');return;}render();toast(error.message||'Message could not be sent. Please try again.');}}
async function confirmVoiceReal(){
  const edit=$('#voice-edit');if(edit)state.voiceText=edit.value.trim();
  if(!state.voiceText)return toast('There is no transcript to confirm.');
  const linkedProgramme=activeSupportProgrammeId();
  const translation=state.voiceTranslation||null;
  try{
    if(voicePurpose==='reply'){
      pendingSupportKind='reply';
      const result=await api('/api/cases/from-reply',{method:'POST',body:JSON.stringify({text:state.voiceText,translation_en:translation,language:currentUser?.language||'English',programme_id:linkedProgramme,confirmed:true})});
      if(result.action==='choose_support_target'||result.action==='contact_staff'){state.voiceResult={...result,intent:'request_human'};render();openModal('voice-confirmed');return;}
      toast(result.status==='escalated'?'Your message has been sent to the programme team.':'Voxera sent your follow-up reply.');
      state.voiceText='';state.voiceTranslation='';page='Messages';selectedConversationId=result.conversation_id;conversationId=result.conversation_id;messageView='conversation';await hydrateReal();render();return;
    }
    pendingSupportKind='assistant';
    state.voiceResult=await api('/api/assistant/confirm',{method:'POST',body:JSON.stringify({text:state.voiceText,translation_en:translation,language:currentUser?.language||'English',programme_id:linkedProgramme,confirmed:true})});
    if(state.voiceResult.conversation_id){page='Messages';selectedConversationId=state.voiceResult.conversation_id;conversationId=state.voiceResult.conversation_id;messageView='conversation';}
    await hydrateReal();
    if(state.voiceResult.status==='escalated')toast('Your message has been sent to the team.');
    else if(state.voiceResult.status==='ai_resolved')toast('Voxera sent its reviewed reply.');
    render();openModal('voice-confirmed');
  }catch(error){toast(error.message);}
}
function activeSupportProgrammeId(){
  if(page!=='Messages'||messageView!=='conversation')return null;
  return state.conversations?.find(item=>item.id===selectedConversationId)?.programme_id||null;
}
async function selectSupportTarget(programmeId){
  closeModal();
  const body={text:state.voiceText,translation_en:state.voiceTranslation||state.voiceText,language:currentUser?.language||'English',programme_id:Number(programmeId),organisation_id:selectedSupportOrganisationId||activeOrganisationAiId||undefined,confirmed:true};
  try{
    if(pendingSupportKind==='reply'){
      const result=await api('/api/cases/from-reply',{method:'POST',body:JSON.stringify(body)});
      if(!result.conversation_id)throw new Error(result.assistant_text||'The support message could not be routed.');
      state.voiceText='';state.voiceTranslation='';page='Messages';selectedConversationId=result.conversation_id;conversationId=result.conversation_id;messageView='conversation';await hydrateReal();render();toast('Your message has been sent to the selected programme team.');
      return;
    }
    state.voiceResult=await api('/api/assistant/confirm',{method:'POST',body:JSON.stringify(body)});
    if(state.voiceResult.conversation_id){page='Messages';selectedConversationId=state.voiceResult.conversation_id;conversationId=state.voiceResult.conversation_id;messageView='conversation';}
    await hydrateReal();render();openModal('voice-confirmed');
  }catch(error){toast(error.message);}
}
async function endProgramme(programmeId){
  const programme=(state.programmes||[]).find(item=>item.id===Number(programmeId));
  if(!programme||programme.status==='completed')return;
  if(!confirm(`End “${programme.title}” now?\n\nThis removes it from Discover and moves it to programme history. Participants will keep access to existing sessions and videos, but organisers will no longer be able to add sessions, start live classes, or upload videos. Existing participant records and eligible certificates will be preserved.\n\nAny live class must be ended before you can end this programme.`))return;
  try{await api(`/api/programmes/${programmeId}/complete`,{method:'POST'});await hydrateReal();render();toast('Programme ended. It remains in your organisation history.');}
  catch(error){toast(error.message||'The programme could not be ended.');}
}
async function assistantApply(programmeId){try{const result=await api(`/api/programmes/${programmeId}/apply`,{method:'POST'});await hydrateReal();closeModal();toast(result.message);go('My Programmes');}catch(error){toast(error.message);}}

function organiserLiveClass(){
  const programmes=state.programmes||[];
  const programme=programmes.find(p=>p.id===selectedProgrammeId)||programmes[0];
  if(programme)selectedProgrammeId=programme.id;
  const sessions=programme?state.sessionsByProgramme?.[programme.id]||[]:[];
  if(!sessions.some(s=>s.id===selectedSessionId))selectedSessionId=sessions[0]?.id||null;
  return `${head('TOGETHER, IN REAL TIME','Live class','Start a scheduled session. Enrolled participants can join from their phones.')}<section class="grid split"><div class="card"><div class="field"><label>Programme</label><select class="select" onchange="selectLiveProgramme(this.value)">${programmes.map(p=>`<option value="${p.id}" ${p.id===programme?.id?'selected':''}>${esc(p.title)}</option>`).join('')||'<option value="">No programmes yet</option>'}</select></div><div class="field"><label>Session</label><select class="select" onchange="selectLiveSession(this.value)">${sessions.map(s=>`<option value="${s.id}" ${s.id===selectedSessionId?'selected':''}>${esc(s.title)} ·${dateLabel(s.scheduled_start)}</option>`).join('')||'<option value="">No sessions scheduled</option>'}</select></div><div class="notice">Your browser requests webcam and microphone access. The recording uploads to this local server when the session ends.</div><button class="btn ${state.live?'btn-soft':'btn-primary'}" onclick="toggleLive()" ${!selectedSessionId?'disabled':''}>${state.live?'End session and save recording':'Start live session'}</button></div><div class="card"><div class="media-stage"><video id="organiser-video" autoplay muted playsinline></video><div class="video-label">${state.live?'● LIVE':'Camera preview appears here'}</div></div></div></section><article class="card" style="margin-top:16px"><div class="card-head"><div class="card-title">Participant presence</div><span class="row-meta">Attendance requires at least 70% of session duration</span></div><div id="live-participant-list" class="programme-list"><div class="empty">Presence updates when enrolled participants join.</div></div></article>`;
}
const organiserLiveClassWithoutUpload=organiserLiveClass;
organiserLiveClass=function(){return organiserLiveClassWithoutUpload().replace('</section><article class="card" style="margin-top:16px">','</section><section class="card recording-upload-card" style="margin-top:16px"><div class="card-head"><div><div class="card-title">Upload a recorded class</div><div class="row-meta">Share a video with enrolled participants. Maximum size: 1 GB.</div></div></div><div class="record-controls"><input id="class-recording-file" type="file" accept="video/webm,video/mp4,video/ogg,.webm,.mp4,.ogv"><button class="btn btn-outline btn-small" onclick="uploadClassRecording()">Upload recording</button></div></section><article class="card" style="margin-top:16px">');};
const organiserLiveClassWithUpload=organiserLiveClass;
organiserLiveClass=function(){
  return organiserLiveClassWithUpload().replace('Your browser requests webcam and microphone access. The recording uploads to this local server when the session ends.</div>','Your browser requests webcam and microphone access.</div><label class="recording-choice"><input id="save-live-recording" type="checkbox"><span><b>Save this live recording</b><small>Off by default. When enabled, the class is uploaded after you end the session.</small></span></label><label class="recording-choice"><input id="enable-live-captions" type="checkbox"><span><b>Automatic English captions</b><small>Uses your browser speech service, which may process audio externally. Participants see captions live; saved captions are included with the video.</small></span></label><div id="live-caption-panel" class="live-caption-panel" hidden><span class="eyebrow">LIVE CAPTION</span><div id="live-caption-text"></div></div>');
};
const organiserLiveClassWithRecordingOptions=organiserLiveClass;
organiserLiveClass=function(){
  return organiserLiveClassWithRecordingOptions().replace('Maximum size: 1 GB.','Maximum size: 1 GB. Add a .vtt file, or generate captions with the local Whisper model and FFmpeg.').replace('accept="video/webm,video/mp4,video/ogg,.webm,.mp4,.ogv"><button class="btn btn-outline btn-small" onclick="uploadClassRecording()">Upload recording</button>','accept="video/webm,video/mp4,video/ogg,.webm,.mp4,.ogv"><input id="class-caption-file" type="file" accept=".vtt,text/vtt" aria-label="Optional WebVTT captions file"><button class="btn btn-outline btn-small" onclick="uploadClassRecording()">Upload video</button><button class="btn btn-soft btn-small" onclick="generateRecordingCaptions()">Generate auto captions</button>');
};
const organiserLiveClassBeforeRedesign=organiserLiveClass;
organiserLiveClass=function(){
  let html=organiserLiveClassBeforeRedesign();
  const session=Object.values(state.sessionsByProgramme||{}).flat().find(item=>Number(item.id)===Number(selectedSessionId));
  const uploadStart=html.indexOf('<section class="card recording-upload-card"');
  const uploadEnd=uploadStart>=0?html.indexOf('</section>',uploadStart)+10:-1;
  if(uploadStart>=0&&uploadEnd>uploadStart){
    const currentVideo=session?.recording_file?`<div class="current-recording-preview"><video muted playsinline preload="metadata" src="/api/sessions/${session.id}/recording?token=${encodeURIComponent(authToken)}"></video><div><b>Class video is published</b><small>Programme applicants and participants can watch it from their programme page.</small></div><span class="badge">Ready</span></div>`:'<div class="upload-empty-state"><span aria-hidden="true">▶</span><b>No class video yet</b><small>Choose a session recording to publish it for programme applicants and participants.</small></div>';
    const keepAvailable=session?.recording_file?!!session.recording_no_expiry:true;
    const panel=`<section class="card recording-upload-card recording-manager"><div class="recording-manager-heading"><div><span class="eyebrow">CLASS LIBRARY</span><h2>Publish a class video</h2><p>Select a session, add its recording, then share it with programme applicants and participants.</p></div><span class="recording-cloud-icon" aria-hidden="true">↑</span></div>${currentVideo}<div class="recording-upload-grid"><label class="upload-dropzone" for="class-recording-file"><span class="upload-cloud" aria-hidden="true">↑</span><b>Choose a video to upload</b><small>MP4, WebM or Ogg · up to 1 GB</small><span class="btn btn-outline btn-small">Browse videos</span><input id="class-recording-file" type="file" accept="video/webm,video/mp4,video/ogg,.webm,.mp4,.ogv" onchange="previewRecordingUpload(this)"><span id="recording-file-name" class="upload-file-name">No video selected</span></label><div class="recording-publish-options"><label class="caption-upload-label"><span><b>Optional captions</b><small>Add a WebVTT file for accessible playback.</small></span><input id="class-caption-file" type="file" accept=".vtt,text/vtt" onchange="previewCaptionUpload(this)"><span id="caption-file-name" class="row-meta">No captions selected</span></label><label class="toggle recording-availability"><input id="recording-keep-available" type="checkbox" ${state.live?(liveKeepAvailable?'checked':''):(keepAvailable?'checked':'')} onchange="setRecordingAvailability(this)" ${state.live?'disabled':''}><span><b>Keep video available without an expiry date</b><small>Otherwise, it follows the session recording deadline.</small></span></label><button class="btn btn-soft btn-small" type="button" onclick="generateRecordingCaptions()">Generate auto captions</button><small>Local captions need FFmpeg and the optional Whisper model.</small><button id="upload-recording-button" class="btn btn-primary" type="button" onclick="uploadClassRecording()" ${session&&!state.live?'':'disabled'}>Publish video to programme</button><div id="recording-upload-progress" class="recording-upload-progress" hidden><div class="progress"><i id="recording-upload-progress-bar" style="width:0%"></i></div><span id="recording-upload-progress-label">Preparing upload…</span></div></div></div></section>`;
    html=html.slice(0,uploadStart)+panel+html.slice(uploadEnd);
  }
  if(state.live&&selectedSessionId)html=html.replace('<article class="card" style="margin-top:16px"><div class="card-head"><div class="card-title">Participant presence</div>',`${liveChatPanel()}<article class="card" style="margin-top:16px"><div class="card-head"><div class="card-title">Participant presence</div>`);
  return html;
};
const organiserLiveClassWithRecordingState=organiserLiveClass;
organiserLiveClass=function(){
  let html=organiserLiveClassWithRecordingState();
  html=html.replace('onchange="selectLiveProgramme(this.value)"','onchange="selectLiveProgramme(this.value)"'+(state.live?' disabled':''));
  html=html.replace('onchange="selectLiveSession(this.value)"','onchange="selectLiveSession(this.value)"'+(state.live?' disabled':''));
  html=html.replace('id="save-live-recording" type="checkbox"','id="save-live-recording" type="checkbox" '+(saveLiveRecording?'checked ':'')+(state.live?'disabled ':''));
  html=html.replace('id="enable-live-captions" type="checkbox"','id="enable-live-captions" type="checkbox" '+(liveCaptionsEnabled?'checked ':'')+(state.live?'disabled ':''));
  html=html.replace(state.live?'End session and save recording':'Start live session',state.live?'End live session':'Start live session');
  return recordingUploadMarkup(html);
};
function selectLiveProgramme(value){selectedProgrammeId=Number(value);selectedSessionId=state.sessionsByProgramme?.[selectedProgrammeId]?.[0]?.id||null;render();}
function selectLiveSession(value){selectedSessionId=Number(value)||null;}

function editProgrammeReal(id){
  const p=state.programmes.find(x=>x.id===Number(id));if(!p)return toast('Programme not found.');
  const sessions=state.sessionsByProgramme?.[p.id]||[];
  const sessionRows=sessions.length?sessions.map(s=>`<div class="programme-row"><div class="row-main"><b>${esc(s.title)}</b><div class="row-meta">${esc(s.kind)} · ${dateLabel(s.scheduled_start)} · ${s.deadline_days} day recording deadline</div></div><span class="badge">${s.quiz_count??JSON.parse(s.quiz_json||'[]').length} quiz</span></div>`).join(''):'<p class="empty">No sessions yet. Add the real session dates below.</p>';
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-top"><div><h2>Manage programme</h2><p>Published by ${esc(p.organiser_name||state.settings?.name||'your organisation')}</p></div><button class="close" onclick="closeModal()">×</button></div><form onsubmit="saveProgrammeReal(event,${p.id})"><div class="field"><label>Programme name</label><input id="edit-title" value="${esc(p.title)}" required></div><div class="field"><label>Description</label><textarea id="edit-description" required>${esc(p.description||'')}</textarea></div><div class="grid split"><div class="field"><label>Category</label><input id="edit-category" value="${esc(p.category)}" required></div><div class="field"><label>Format</label><select id="edit-format"><option ${p.format==='Online'?'selected':''}>Online</option><option ${p.format==='Physical'?'selected':''}>Physical</option><option ${p.format==='Hybrid'?'selected':''}>Hybrid</option></select></div></div><div class="grid split"><div class="field"><label>Location</label><input id="edit-location" value="${esc(p.location)}" required></div><div class="field"><label>Capacity</label><input id="edit-capacity" type="number" min="1" value="${p.capacity}" required></div></div><div class="field"><label>Eligibility</label><textarea id="edit-eligibility" required>${esc(p.eligibility||'')}</textarea></div><div class="grid split"><div class="field"><label>Start date</label><input id="edit-start" type="date" value="${esc(p.start_date)}" required></div><div class="field"><label>End date</label><input id="edit-end" type="date" value="${esc(p.end_date)}" required></div></div><div class="grid split"><div class="field"><label>Certificate threshold</label><input id="edit-threshold" type="number" min="1" max="100" value="${p.certificate_threshold}" required></div><div class="field"><label>Status</label><select id="edit-status">${['draft','open','closed','ongoing','completed'].map(x=>`<option value="${x}" ${x===p.status?'selected':''}>${x}</option>`).join('')}</select></div></div><button class="btn btn-primary">Save programme</button></form><hr><h3>Sessions</h3>${sessionRows}<form onsubmit="addRealSession(event,${p.id})"><h4>Add a session</h4><div class="field"><label>Session title</label><input id="session-title" required></div><div class="grid split"><div class="field"><label>Session type</label><select id="session-kind"><option value="live_online">Live online</option><option value="physical">In person</option></select></div><div class="field"><label>Recording deadline (days)</label><input id="session-deadline" type="number" min="1" max="90" value="7"></div></div><div class="field"><label>Starts</label><input id="session-start" type="datetime-local" required></div><div class="field"><label>Quiz JSON (optional, up to 3 questions)</label><textarea id="session-quiz" rows="4" placeholder='[{"question":"What did you learn?","options":["A","B"],"answer":0}]'></textarea></div><button class="btn btn-outline btn-small">Add session</button></form></div></div>`);
}
async function saveProgrammeReal(event,id){event.preventDefault();const body={title:$('#edit-title').value.trim(),description:$('#edit-description').value.trim(),category:$('#edit-category').value.trim(),format:$('#edit-format').value,location:$('#edit-location').value.trim(),capacity:Number($('#edit-capacity').value),eligibility:$('#edit-eligibility').value.trim(),start_date:$('#edit-start').value,end_date:$('#edit-end').value,status:$('#edit-status')?.value||state.programmes.find(item=>Number(item.id)===Number(id))?.status||'open',activity_type:$('#edit-activity-type')?.value||'programme',admission_mode:$('#edit-admission-mode')?.value||'approval',certificate_threshold:Number($('#edit-threshold').value)};try{await api(`/api/programmes/${id}`,{method:'PATCH',body:JSON.stringify(body)});await hydrateReal();toast('Activity details saved.');}catch(error){toast(error.message);}}
const editProgrammeWithRawQuiz=editProgrammeReal;
editProgrammeReal=function(id){editProgrammeWithRawQuiz(id);const programme=state.programmes.find(item=>item.id===id);const admissionField=$('#edit-status')?.closest('.field');if(admissionField)admissionField.insertAdjacentHTML('beforebegin',admissionControlMarkup('edit-admission-mode',programme?.admission_mode||'approval'));const quizField=$('#session-quiz')?.closest('.field');if(quizField)quizField.outerHTML=`<div class="field"><label class="toggle"><input type="checkbox" id="session-quiz-enabled" onchange="toggleSessionQuiz(this.checked)"> Add an optional post-session quiz</label><div id="session-quiz-builder" hidden>${quizQuestionEditor(0)}</div><button type="button" class="btn btn-outline btn-small" id="add-quiz-question" hidden onclick="addQuizQuestion()">＋ Add another question</button></div>`;};
function quizQuestionEditor(index){return `<fieldset class="quiz-question-card"><legend>Question ${index+1}</legend><div class="field"><label>Question</label><input class="quiz-prompt" maxlength="500" placeholder="Write your question"></div><div class="grid split">${[0,1,2,3].map(option=>`<div class="field"><label>Option ${option+1}</label><input class="quiz-option" maxlength="300" placeholder="Answer option"></div>`).join('')}</div><div class="field"><label>Correct option</label><select class="quiz-answer"><option value="0">Option 1</option><option value="1">Option 2</option><option value="2">Option 3</option><option value="3">Option 4</option></select></div></fieldset>`;}
function toggleSessionQuiz(enabled){$('#session-quiz-builder').hidden=!enabled;$('#add-quiz-question').hidden=!enabled;}
function addQuizQuestion(){const cards=document.querySelectorAll('.quiz-question-card');if(cards.length>=3)return toast('A session can have up to three questions.');$('#session-quiz-builder').insertAdjacentHTML('beforeend',quizQuestionEditor(cards.length));}
function readSessionQuiz(){if(!$('#session-quiz-enabled')?.checked)return [];const cards=[...document.querySelectorAll('.quiz-question-card')];const quiz=[];for(const [index,card] of cards.entries()){const question=card.querySelector('.quiz-prompt').value.trim();const rawOptions=[...card.querySelectorAll('.quiz-option')].map(option=>option.value.trim());const selected=Number(card.querySelector('.quiz-answer').value);const options=rawOptions.filter(Boolean);if(!question||options.length<2||!rawOptions[selected]){toast(`Complete question ${index+1}, add at least two answer options, and choose a correct option.`);return null;}quiz.push({question,options,answer:rawOptions.slice(0,selected).filter(Boolean).length});}return quiz;}
async function addRealSession(event,id){event.preventDefault();const programme=state.programmes.find(item=>Number(item.id)===Number(id));if(!usesProgrammeClasses(programme))return toast('Activities, events, campaigns, and services do not use class sessions.');if(programme.status==='completed')return toast('This programme has ended. You can no longer add sessions.');const start=new Date($('#session-start').value);if(Number.isNaN(start.valueOf()))return toast('Choose a valid session start.');const quiz=readSessionQuiz();if(quiz===null)return;try{await api(`/api/programmes/${id}/sessions`,{method:'POST',body:JSON.stringify({title:$('#session-title').value.trim(),description:$('#session-description').value.trim(),kind:$('#session-kind').value,scheduled_start:start.toISOString(),scheduled_end:new Date(start.getTime()+60*60*1000).toISOString(),deadline_days:Number($('#session-deadline').value),quiz})});await hydrateReal();closeModal();manageProgrammeSessions(id);}catch(error){toast(error.message);}}
function editProgrammeDetails(id){
  const programme=state.programmes.find(item=>Number(item.id)===Number(id));if(!programme)return toast('Programme not found.');
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><form class="modal" onsubmit="saveProgrammeReal(event,${programme.id})"><div class="modal-top"><div><span class="eyebrow">PROGRAMME DETAILS</span><h2>Edit programme</h2><p>Session planning is managed separately from programme details.</p></div><button type="button" class="close" onclick="closeModal()" aria-label="Close">×</button></div><div class="field"><label>Programme name</label><input id="edit-title" value="${esc(programme.title)}" required></div><div class="field"><label>Description</label><textarea id="edit-description" required>${esc(programme.description||'')}</textarea></div><div class="grid split"><div class="field"><label>Category</label><input id="edit-category" value="${esc(programme.category)}" required></div><div class="field"><label>Format</label><select id="edit-format"><option ${programme.format==='Online'?'selected':''}>Online</option><option ${programme.format==='Physical'?'selected':''}>Physical</option><option ${programme.format==='Hybrid'?'selected':''}>Hybrid</option></select></div></div><div class="grid split"><div class="field"><label>Location</label><input id="edit-location" value="${esc(programme.location)}" required></div><div class="field"><label>Capacity</label><input id="edit-capacity" type="number" min="1" value="${programme.capacity}" required></div></div><div class="field"><label>Eligibility</label><textarea id="edit-eligibility" required>${esc(programme.eligibility||'')}</textarea></div><div class="grid split"><div class="field"><label>Start date</label><input id="edit-start" type="date" value="${esc(programme.start_date)}" required></div><div class="field"><label>End date</label><input id="edit-end" type="date" value="${esc(programme.end_date)}" required></div></div><div class="grid split"><div class="field"><label>Certificate threshold</label><input id="edit-threshold" type="number" min="1" max="100" value="${programme.certificate_threshold}" required></div><div class="field"><label>Visibility</label><select id="edit-status">${['draft','open','closed','ongoing','completed'].map(status=>`<option value="${status}" ${status===programme.status?'selected':''}>${status}</option>`).join('')}</select></div></div>${admissionControlMarkup('edit-admission-mode',programme.admission_mode||'approval')}<div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary">Save programme</button></div></form></div>`);
}
function manageProgrammeSessions(programmeId){
  const programme=state.programmes.find(item=>Number(item.id)===Number(programmeId));if(!programme)return toast('Programme not found.');
  if(!usesProgrammeClasses(programme))return toast('Activities, events, campaigns, and services do not use class sessions.');
  if(programme.status==='completed')return toast('This programme has ended. You can no longer manage or add sessions.');
  const sessions=state.sessionsByProgramme?.[programme.id]||[];
  const rows=sessions.length?sessions.map(session=>`<article class="session-manage-row"><div><b>${esc(session.title)}</b><small>${esc(session.kind.replaceAll('_',' '))} · ${dateLabel(session.scheduled_start)} · ${session.deadline_days} day recording window</small>${session.description?`<p>${esc(session.description)}</p>`:''}${session.recording_file?'<span class="badge">Video published</span>':''}</div><div class="session-manage-actions">${session.kind==='physical'?`<button class="btn btn-soft btn-small" type="button" onclick="openPhysicalSessionAttendance(${session.id})">Attendance & QR check-in</button>`:''}<button class="btn btn-outline btn-small" type="button" onclick="deleteSessionReal(${session.id},${programme.id})" aria-label="Delete ${esc(session.title)}">Delete</button></div></article>`).join(''):'<div class="empty">No sessions have been added to this programme yet.</div>';
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-back session-manager-backdrop" onclick="if(event.target===this)closeModal()"><section class="modal session-manager"><div class="modal-top"><div><span class="eyebrow">PROGRAMME SCHEDULE</span><h2>${esc(programme.title)} · Sessions</h2><p>Create and manage sessions here. This is separate from the programme details form.</p></div><button type="button" class="close" onclick="closeModal()" aria-label="Close">×</button></div><div class="session-manager-list">${rows}</div><form class="session-create-form" onsubmit="addRealSession(event,${programme.id})"><h3>Add a session</h3><div class="field"><label for="session-title">Session title</label><input id="session-title" required minlength="3" maxlength="120" placeholder="e.g. Welcome and introductions"></div><div class="field"><label for="session-description">Session description</label><textarea id="session-description" maxlength="2000" rows="2" placeholder="What will participants learn or do in this session?"></textarea></div><div class="grid split"><div class="field"><label for="session-kind">Session format</label><select id="session-kind"><option value="live_online">Live online</option><option value="physical">In person</option></select></div><div class="field"><label for="session-deadline">Recording availability (days)</label><input id="session-deadline" type="number" min="1" max="90" value="7" required></div></div><div class="field"><label for="session-start">Starts</label><input id="session-start" type="datetime-local" min="${esc(programme.start_date)}T00:00" max="${esc(programme.end_date)}T23:59" required></div><div class="field"><label class="toggle"><input type="checkbox" id="session-quiz-enabled" onchange="toggleSessionQuiz(this.checked)"> Add an optional post-session quiz</label><div id="session-quiz-builder" hidden>${quizQuestionEditor(0)}</div><button type="button" class="btn btn-outline btn-small" id="add-quiz-question" hidden onclick="addQuizQuestion()">＋ Add another question</button></div><button class="btn btn-primary" type="submit">＋ Create session</button></form></section></div>`);
}
function openPhysicalSessionAttendance(sessionId){
  const session=Object.values(state.sessionsByProgramme||{}).flat().find(item=>Number(item.id)===Number(sessionId));
  if(!session||session.kind!=='physical')return toast('Attendance QR check-in is available for in-person sessions.');
  selectedSessionId=Number(session.id);
  openModal('qr');
}
async function deleteSessionReal(sessionId,programmeId){
  if(!confirm('Delete this session and its attendance records, chat, recording, and playback progress? This cannot be undone.'))return;
  try{await api(`/api/sessions/${sessionId}`,{method:'DELETE'});if(Number(selectedSessionId)===Number(sessionId))selectedSessionId=null;await hydrateReal();closeModal();manageProgrammeSessions(programmeId);toast('Session and its related records were deleted.');}catch(error){toast(error.message);}
}

function realQrModal(){const sessions=Object.values(state.sessionsByProgramme||{}).flat();if(!selectedSessionId)selectedSessionId=sessions[0]?.id||null;document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this){stopQrScanner();closeModal()}"><div class="modal"><div class="modal-top"><div><h2>Physical attendance</h2><p>Scan a participant’s personal code or show the session code for them to scan.</p></div><button class="close" onclick="stopQrScanner();closeModal()">×</button></div><div class="field"><label>Session</label><select class="select" onchange="selectLiveSession(this.value)">${sessions.map(s=>`<option value="${s.id}" ${s.id===selectedSessionId?'selected':''}>${esc(s.programme_title||'')} · ${esc(s.title)} ·${dateLabel(s.scheduled_start)}</option>`).join('')||'<option value="">No sessions scheduled</option>'}</select></div><video id="scan-camera" class="scan-video" playsinline></video><div class="record-controls"><button class="btn btn-primary btn-small" onclick="installQrScanner()">Open camera scanner</button><button class="btn btn-outline btn-small" onclick="showSessionQr()">Show session QR</button></div><div id="session-qr-holder"></div><div class="field"><label>Manual check-in participant</label><select id="manual-participant"><option value="">Choose a participant</option>${(state.people||[]).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="btn btn-soft btn-small" onclick="manualCheckin()">Record physical attendance</button></div></div></div>`);}
async function manualCheckin(){const id=Number($('#manual-participant')?.value);if(!id||!selectedSessionId)return toast('Choose a participant and session.');try{await api(`/api/sessions/${selectedSessionId}/attendance?participant_id=${id}&mode=physical_qr`,{method:'POST'});await hydrateReal();toast('Physical attendance recorded.');closeModal();}catch(error){toast(error.message);}}

function topbarParticipant(){return realTopbar();}
async function registerReal(event){event.preventDefault();const payload={name:$('#register-name').value.trim(),username:$('#register-user').value.trim(),password:$('#register-password').value,language:$('#register-language').value,area:$('#register-area').value.trim(),consent_data:$('#register-data').checked,consent_voice:$('#register-voice').checked,consent_followup:$('#register-followup').checked};try{const result=await api('/api/auth/register',{method:'POST',body:JSON.stringify(payload)});if(result.verification_required){localStorage.setItem(`voxera-guide-pending-${payload.username.toLowerCase()}`,'signup');pendingAuthEmail=payload.username;authRole='participant';authView='verify';render();toast(result.message);return;}saveLogin(result);role='participant';page='Home';closeModal();await hydrate();render();showGuide(true);}catch(error){toast(error.message||'Could not create your participant account.');}}

window.__baseOpenModal=window.openModal;
window.__baseRegister=window.registerAccount;
window.hydrate=hydrateReal;
window.topbar=realTopbar;
window.layout=realLayout;
window.render=renderReal;
window.loginPage=setupPage;
window.openModal=realOpenModal;
window.createOrganisation=createOrganisation;
window.createProgramme=createProgrammeReal;
window.programmes=programmesWithReview;
window.programmeCards=programmeCardsReal;
window.dashboard=dashboardReal;
window.participants=participantsReal;
window.attendance=attendanceReal;
window.staffInbox=staffInboxReal;
window.reports=reportsReal;
window.settings=settingsReal;
window.participantHome=participantHomeReal;
window.participantDiscover=participantDiscoverReal;
const participantProgrammeDetailBeforeHistoryAccessMessage=participantProgrammeDetail;
participantProgrammeDetail=function(){
  let html=participantProgrammeDetailBeforeHistoryAccessMessage();
  const programme=state.programmes.find(item=>Number(item.id)===Number(participantProgrammeId))||(state.organisationDetail?.programmes||[]).find(item=>Number(item.id)===Number(participantProgrammeId));
  const enrolment=(state.enrolments||[]).find(item=>Number(item.programme_id)===Number(participantProgrammeId));
  const hasSessionAccess=enrolment&&['enrolled','completed'].includes(enrolment.status);
  if(programme&&!hasSessionAccess&&!(state.sessionsByProgramme?.[participantProgrammeId]||[]).length){
    html=html.replace(/(<div class="programme-section-head"><div><h2>Sessions & class videos<\/h2>[\s\S]*?<\/div><\/div>)/,'$1<div class="notice">Session schedules, live classes, and recordings are available after your enrolment is approved.</div>');
  }
  return html;
};
window.myProgrammes=myProgrammesReal;
window.participantMessages=realParticipantMessages;
window.profile=profileReal;
window.messages=organiserMessagesReal;
window.liveClass=organiserLiveClass;
window.editProgramme=editProgrammeDetails;
window.editProgrammeDetails=editProgrammeDetails;
window.manageProgrammeSessions=manageProgrammeSessions;
window.setDiscoverSection=setDiscoverSection;
window.setDiscoverFilter=setDiscoverFilter;
window.openOrganisation=openOrganisation;
window.closeOrganisation=closeOrganisation;
window.endProgramme=endProgramme;
window.deleteSessionReal=deleteSessionReal;
window.filterApplicationReview=filterApplicationReview;
window.organizerPage=function(){if(page==='Programmes')return programmesWithReview();return ({Dashboard:dashboardReal,Programmes:programmesWithReview,Participants:participantsReal,Attendance:attendanceReal,'Live Class':organiserLiveClass,Messages:organiserMessagesReal,Reports:reportsReal,Gallery:organisationGalleryPage,Settings:settingsReal}[page]||dashboardReal)();};
window.selectLiveProgramme=selectLiveProgramme;
window.selectLiveSession=selectLiveSession;
window.saveProgrammeReal=saveProgrammeReal;
window.addRealSession=addRealSession;
window.manualCheckin=manualCheckin;
window.selectConversation=selectConversation;
window.backToMessageInbox=backToMessageInbox;
window.backToFollowupInbox=backToFollowupInbox;
window.updateMessageBadges=updateMessageBadges;
window.setOrganisationMessagesTab=setOrganisationMessagesTab;
window.openProgrammeConversation=openProgrammeConversation;
window.openOrganisationConversation=openOrganisationConversation;
window.replyCaseId=replyCaseId;
window.closeCaseId=closeCaseId;
window.markAiWrong=markAiWrong;
window.setProgrammeQuery=setProgrammeQuery;
window.mobileMore=mobileMore;
window.showGuide=showGuide;
window.guideNext=guideNext;
window.guideBack=guideBack;
window.finishGuide=finishGuide;
window.filterParticipants=filterParticipants;
window.chooseAttendanceProgramme=chooseAttendanceProgramme;
window.registerAccount=registerReal;
window.loginForm=loginReal;
window.togglePasswordVisibility=togglePasswordVisibility;
window.startGoogleAuth=startGoogleAuth;
window.verifyEmail=verifyEmail;
window.resendVerification=resendVerification;
window.showPasswordReset=showPasswordReset;
window.requestPasswordResetForm=requestPasswordResetForm;
window.completePasswordResetForm=completePasswordResetForm;
window.chooseAuth=chooseAuth;
window.openOrgSetup=openOrgSetup;
window.backToAuth=backToAuth;
window.toggleSessionQuiz=toggleSessionQuiz;
window.addQuizQuestion=addQuizQuestion;
window.sendMessage=sendMessageReal;
window.confirmVoice=confirmVoiceReal;
window.assistantApply=assistantApply;
window.selectSupportTarget=selectSupportTarget;
function admissionControlMarkup(id,value='approval'){return `<div class="field"><label for="${id}">Who can join?</label><select id="${id}" required><option value="approval" ${value==='approval'?'selected':''}>Applicants request to join; I review and accept them</option><option value="open" ${value==='open'?'selected':''}>Open join; anyone can join immediately</option></select><small class="row-meta">Open join enrols eligible participants immediately until capacity is reached. Approval mode keeps applications pending for your decision.</small></div>`;}
const openModalWithAdmission=window.openModal;
window.openModal=function(type){if(type==='new-programme'){openProgrammeBuilder();const statusField=$('#new-status')?.closest('.field');if(statusField&&!$('#new-admission-mode'))statusField.insertAdjacentHTML('beforebegin',admissionControlMarkup('new-admission-mode'));return;}openModalWithAdmission(type);};
function openVoiceResultModal(){
  const result=state.voiceResult||{};
  const programmes=result.programmes||[];
  const supportTargets=result.support_targets||[];
  const transcript=state.voiceText||'';
  const meaning=state.voiceTranslation?`<b>English meaning</b><br>${esc(state.voiceTranslation)}`:'<b>English translation is unavailable.</b><br>Review the transcript carefully or type an English translation before continuing.';
  const supportOptions=supportTargets.map(target=>`<article class="phone-card support-target-card"><b>${esc(target.title)}</b><div class="row-meta">${esc(target.organisation_name)} · ${esc(target.status)}</div><button class="btn btn-primary btn-small" onclick="selectSupportTarget(${target.programme_id})">Send to this programme team</button></article>`).join('');
  const supportButton=result.action==='contact_staff'&&!result.programme_id?`<button class="btn btn-primary" onclick="closeModal();go('Discover')">Find programmes</button>`:result.status==='escalated'&&result.programme_id?`<button class="btn btn-primary" onclick="closeModal();openSupportConversation(${currentUser.id},${result.programme_id})">Open support conversation</button>`:'';
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-back" onclick="if(event.target===this)closeModal()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="assistant-result-title"><div class="modal-top"><div><span class="eyebrow">VOXERA ASSISTANT</span><h2 id="assistant-result-title">${result.status==='escalated'?'Your message is with the team':result.action==='choose_support_target'?'Choose a programme':result.action==='contact_staff'?'Programme required':'Here’s what I understood'}</h2></div><button class="close" onclick="closeModal()" aria-label="Close">×</button></div><div class="notice"><b>Your message</b><br>${esc(transcript)}<br><br>${meaning}</div><div class="phone-card"><b>${esc(result.assistant_text||'Please try again or type your question.')}</b>${result.answer_source==='hosted_model'?'<div class="row-meta" style="margin-top:8px">Answered by Voxera’s configured external AI service.</div>':''}${result.intent?`<div class="row-meta" style="margin-top:8px">Intent · ${esc(result.intent.replaceAll('_',' '))}${result.status?` · ${esc(result.status)}`:''}</div>`:''}</div>${supportOptions}${programmes.map(programme=>`<article class="phone-card"><b>${esc(programme.title)}</b><div class="row-meta">${esc(programme.organisation_name||state.settings?.name||'')} · ${esc(programme.format)} · ${esc(programme.location)} · ${dateLabel(programme.start_date)}–${dateLabel(programme.end_date)}</div><p>${esc(programme.eligibility||programme.description||'')}</p>${result.intent==='register'&&programme.status==='open'?`<button class="btn btn-primary btn-small" onclick="assistantApply(${programme.id})">Apply to this programme</button>`:''}</article>`).join('')}<div class="modal-actions">${'speechSynthesis' in window?'<button class="btn btn-soft" onclick="speakVoxeraAnswer()">Read answer aloud</button>':''}<button class="btn btn-outline" onclick="closeModal()">Close</button>${supportButton}</div></section></div>`);
}
const openVoiceResultModalWithoutRecommendations=openVoiceResultModal;
openVoiceResultModal=function(){openVoiceResultModalWithoutRecommendations();const result=state.voiceResult||{};if(result.intent!=='programme_recommendation')return;const modals=document.querySelectorAll('.modal-back');const modal=modals[modals.length-1]?.querySelector('.modal');if(!modal)return;for(const programme of result.programmes||[]){const card=[...modal.querySelectorAll('.phone-card')].find(item=>item.querySelector('b')?.textContent===programme.title);if(!card)continue;if(programme.review_count){const rating=document.createElement('div');rating.className='row-meta';rating.textContent=`★ ${programme.rating_average}/5 · ${programme.review_count} participant review${programme.review_count===1?'':'s'}`;card.append(rating);}if(programme.status==='open'){const button=document.createElement('button');button.className='btn btn-primary btn-small';button.textContent=programme.admission_mode==='open'?'Join this programme':'Apply to this programme';button.addEventListener('click',()=>assistantApply(programme.id));card.append(button);}}};
function speakVoxeraAnswer(){const text=state.voiceResult?.assistant_text;if(!text||!window.speechSynthesis)return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=({English:'en-NG',Pidgin:'en-NG',Yoruba:'yo-NG',Hausa:'ha-NG',Igbo:'ig-NG'})[currentUser?.language||'English']||'en-NG';window.speechSynthesis.speak(utterance);}
window.speakVoxeraAnswer=speakVoxeraAnswer;
const openModalWithVoiceResult=window.openModal;
window.openModal=function(type){if(type==='voice-confirmed'){openVoiceResultModal();return;}openModalWithVoiceResult(type);};
function typedAssistantModal(){document.body.insertAdjacentHTML('beforeend',`<div class="modal-back typed-assistant-modal" onclick="if(event.target===this)closeModal()"><form class="modal" onsubmit="submitTypedAssistantQuestion(event)"><div class="modal-top"><div><span class="eyebrow">VOXERA ASSISTANT</span><h2>Ask Voxera</h2><p>Ask a question or tell me what you’d like to learn.</p></div><button type="button" class="close" onclick="closeModal()" aria-label="Close">×</button></div><div class="field"><label for="typed-voice">Your message</label><textarea id="typed-voice" rows="4" maxlength="4000" required placeholder="For example: I want to learn coding"></textarea></div><div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" type="submit">Ask Voxera</button></div></form></div>`);}
async function submitTypedAssistantQuestion(event){
  event.preventDefault();
  const text=event.currentTarget.querySelector('#typed-voice')?.value.trim();
  if(!text){toast('Type a message first.');return;}
  closeModal();
  toggleParticipantAiChat(true);
  const input=$('#participant-ai-message-input');
  if(!input){toast('Voxera chat could not be opened. Please try again.');return;}
  input.value=text;
  await sendParticipantAiMessage({preventDefault(){}});
}
const openModalWithTypedAssistant=window.openModal;
window.openModal=function(type){if(type==='type-message'){typedAssistantModal();return;}openModalWithTypedAssistant(type);};
const renderIconWithoutMic=window.lucideIcon;
window.lucideIcon=function(name,size){return renderIconWithoutMic(name==='mic'?'audioLines':name,size);};
window.submitTypedAssistantQuestion=submitTypedAssistantQuestion;
window.escalateHuman=escalateHumanReal;
window.addProgrammeSessionDraft=addProgrammeSessionDraft;
window.removeProgrammeSessionDraft=removeProgrammeSessionDraft;
window.previewProgrammeImage=previewProgrammeImage;
window.syncParticipantProgrammeData=syncParticipantProgrammeData;
function loadProgrammeImages(root){
  const sequence=++programmeImageLoadSequence;
  for(const url of programmeImageUrls)URL.revokeObjectURL(url);
  programmeImageUrls.clear();
  root.querySelectorAll('img[data-programme-image]').forEach(async image=>{
    try{
      const response=await fetch(`/api/programmes/${image.dataset.programmeImage}/image`,{headers:{Authorization:`Bearer ${authToken}`}});
      if(!response.ok)throw new Error(`Image request returned ${response.status}.`);
      const url=URL.createObjectURL(await response.blob());
      if(sequence!==programmeImageLoadSequence||!image.isConnected){URL.revokeObjectURL(url);return;}
      programmeImageUrls.add(url);image.src=url;
    }catch(error){if(sequence===programmeImageLoadSequence)console.warn('Could not load programme image:',error.message);}
  });
}
function loadAccountImages(root){
  const sequence=++accountImageLoadSequence;
  for(const url of accountImageUrls)URL.revokeObjectURL(url);
  accountImageUrls.clear();
  const requests=[...root.querySelectorAll('img[data-account-photo]')].map(image=>[image,'/api/account/photo']);
  if(root.querySelector('img[data-organisation-photo]'))requests.push([root.querySelector('img[data-organisation-photo]'),'/api/settings/photo']);
  if(root.querySelector('img[data-organisation-banner]'))requests.push([root.querySelector('img[data-organisation-banner]'),'/api/settings/banner']);
  for(const [image,path] of requests)fetch(path,{headers:authToken?{Authorization:`Bearer ${authToken}`}:{}}).then(response=>{if(!response.ok)throw new Error(`Image request returned ${response.status}.`);return response.blob();}).then(blob=>{const url=URL.createObjectURL(blob);if(sequence!==accountImageLoadSequence||!image.isConnected){URL.revokeObjectURL(url);return;}accountImageUrls.add(url);image.src=url;image.classList.add('loaded');image.closest('.profile-big,.avatar,.settings-avatar')?.classList.add('has-photo');}).catch(error=>{if(error.message!=='Image request returned 404.')console.warn('Could not load profile photo:',error.message);});
}
const renderRealWithProgrammeImages=renderReal;
renderReal=function(){renderRealWithProgrammeImages();const app=document.getElementById('app');if(app)loadProgrammeImages(app);if(role==='participant')setTimeout(updateStaticImages,150);};
window.render=renderReal;
const renderRealWithAccountImages=renderReal;
renderReal=function(){applyTheme(state.accountProfile?.theme||currentUser?.theme||'light');renderRealWithAccountImages();const app=document.getElementById('app');if(app)loadAccountImages(app);};
window.render=renderReal;
setInterval(async()=>{if(!authToken||messagePollInFlight)return;messagePollInFlight=true;try{const previous=(state.conversations||[]).map(item=>`${item.id}:${item.unread_count}:${item.last_message_at}:${item.last_message}`).join('|');const available=await refreshConversationList();const next=available.map(item=>`${item.id}:${item.unread_count}:${item.last_message_at}:${item.last_message}`).join('|');const conversationsChanged=previous!==next;let received=0;if(page==='Messages'&&messageView==='conversation'&&conversationId){if(!available.some(item=>Number(item.id)===Number(conversationId))){messageView='inbox';selectedConversationId=null;conversationId=null;state.messages=[];}else{const latestId=(state.messages||[]).reduce((max,message)=>Math.max(max,Number(message.id)||0),0);received=await loadConversation(conversationId,latestId);const active=available.find(item=>Number(item.id)===Number(conversationId));if(active&&Number(active.unread_count)>0)await markConversationRead(conversationId);}}if(page==='Messages'&&(conversationsChanged||received>0)&&document.activeElement?.id!=='message-input')renderReal();}catch(error){console.warn('Voxera message sync failed:',error.message);}finally{messagePollInFlight=false;}},2000);
setInterval(syncParticipantProgrammeData,12000);
setInterval(syncOrganisationActivityData,8000);
setInterval(()=>{if(role!=='participant'||page!=='Speak')return;const status=$('.voice-status');if(!status)return;const voice=state.aiStatus?.voice;const browserSpeechAvailable=!!(window.SpeechRecognition||window.webkitSpeechRecognition);if(!voice){status.textContent='Checking voice availability…';return;}status.textContent=voice.available?'Ready. Audio is sent to this Voxera server; storage follows your voice consent.':`${voice.message} ${browserSpeechAvailable?'You may opt in to browser speech recognition or type instead.':'Type your message instead.'}`;if(state.voiceResult?.translation_available===false){const notice=$('.voice-panel .phone-card .notice');if(notice)notice.innerHTML='<b>English translation unavailable</b><br>Your transcript is ready to review. You can edit it or type an English translation before asking Voxera AI.';}},700);
if(!authToken)api('/api/setup/status').then(result=>{setupRequired=result.setup_required;renderReal();}).catch(error=>{setupRequired=false;renderReal();toast(`Voxera server unavailable: ${error.message}`);});
window.addEventListener('DOMContentLoaded',initializeAuthExperience,{once:true});
function restorePublicOrganisationRoute(){
  const match=location.pathname.match(/^\/organisations\/([^/]+)\/?$/);
  if(match){openGuestOrganisation(decodeURIComponent(match[1]),false);return;}
  if(authToken)return;
  if(authView==='guest'){state.publicOrganisation=null;renderReal();if(!state.publicActivities)openGuestExplore();}
}
window.addEventListener('DOMContentLoaded',restorePublicOrganisationRoute,{once:true});
window.addEventListener('popstate',restorePublicOrganisationRoute);

const programmeCategoryOptions=[
  'Skills & employment',
  'Digital skills',
  'Health & wellbeing',
  'Education & literacy',
  'Enterprise & livelihoods',
  'Financial literacy',
  'Agriculture & climate',
  'Environment & climate',
  'Food security',
  'Community development',
  'Humanitarian support',
  'Leadership & civic engagement',
  'Civic participation',
  'Arts & culture',
  'Research & innovation',
  'Inclusion & accessibility',
  'Other'
];
const programmeFieldHelp={
  'new-title':'Give the programme a short, clear name participants will recognise.',
  'new-desc':'Explain what participants will learn or do, and what they can expect.',
  'new-category':'Choose the topic that best describes this programme.',
  'new-format':'Choose whether sessions happen online, in person, or both.',
  'new-location':'Enter the venue or the online meeting details participants need.',
  'new-capacity':'Set the maximum number of participants who can join.',
  'new-eligibility':'Describe who can apply and any requirements they must meet.',
  'new-start':'Choose the date the programme begins.',
  'new-end':'Choose the date the programme finishes.',
  'new-threshold':'Set the attendance percentage needed for a completion certificate.',
  'new-status':'Publish the programme now or save it as a draft.',
  'new-image':'Optionally add a PNG, JPEG, or WebP image to help participants recognise the programme.',
  'new-admission-mode':'Choose whether applicants need your approval or can join immediately.'
};
function toggleProgrammeFieldHelp(button){
  const hint=button.nextElementSibling;
  const opening=hint.hidden;
  document.querySelectorAll('.programme-field-help').forEach(item=>{item.hidden=true;item.previousElementSibling.setAttribute('aria-expanded','false');});
  hint.hidden=!opening;
  button.setAttribute('aria-expanded',String(opening));
}
function enhanceProgrammeBuilder(){
  const builder=$('.programme-builder');
  if(!builder)return;
  if(!$('#new-activity-type',builder)){
    const field=document.createElement('div');
    field.className='field';
    field.innerHTML='<label for="new-activity-type">Activity type</label><select id="new-activity-type"><option value="programme">Programme</option><option value="activity">Activity</option><option value="event">Event</option><option value="campaign">Campaign</option><option value="service">Service</option></select>';
    $('#new-title',builder)?.closest('.field')?.before(field);
  }
  const activityType=$('#new-activity-type',builder);
  activityType?.addEventListener('change',()=>{
    const label=activityType.selectedOptions[0]?.textContent||'Programme';
    const titleLabel=$('label[for="new-title"]',builder);
    if(titleLabel)titleLabel.textContent=`${label} name`;
    const aboutHeading=$('.programme-form-section h3',builder);
    if(aboutHeading)aboutHeading.textContent=`About this ${label.toLowerCase()}`;
    const submit=$('.modal-actions .btn-primary',builder);
    if(submit)submit.textContent=`Save ${label.toLowerCase()}`;
  });
  const category=$('#new-category',builder);
  if(category&&category.tagName!=='SELECT'){
    const select=document.createElement('select');
    select.id='new-category';
    select.required=true;
    select.setAttribute('aria-label','Programme category');
    select.innerHTML='<option value="">Choose a category</option>'+programmeCategoryOptions.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
    category.replaceWith(select);
  }
  Object.entries(programmeFieldHelp).forEach(([id,description])=>{
    const input=document.getElementById(id);
    const field=input?.closest('.field');
    if(id==='new-image'&&!field){
      const title=$('.programme-image-field b',builder);
      const cover=input?.closest('.programme-image-field');
      const row=title?.parentElement;
      if(!cover||!row||row.querySelector('.field-help-toggle'))return;
      const button=document.createElement('button');
      button.type='button';
      button.className='field-help-toggle';
      button.textContent='?';
      button.setAttribute('aria-label','Help: Programme cover image');
      button.setAttribute('aria-expanded','false');
      button.setAttribute('aria-controls','new-image-help');
      button.onclick=()=>toggleProgrammeFieldHelp(button);
      const hint=document.createElement('span');
      hint.id='new-image-help';
      hint.className='programme-field-help';
      hint.setAttribute('role','tooltip');
      hint.textContent=description;
      hint.hidden=true;
      title.after(button,hint);
      return;
    }
    const label=field?.querySelector('label');
    if(!field||!label||field.querySelector('.field-help-toggle'))return;
    const row=document.createElement('div');
    row.className='field-label-row';
    label.before(row);
    row.append(label);
    const button=document.createElement('button');
    button.type='button';
    button.className='field-help-toggle';
    button.textContent='?';
    button.setAttribute('aria-label',`Help: ${label.textContent.trim()}`);
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls',`${id}-help`);
    button.onclick=()=>toggleProgrammeFieldHelp(button);
    const hint=document.createElement('span');
    hint.id=`${id}-help`;
    hint.className='programme-field-help';
    hint.setAttribute('role','tooltip');
    hint.textContent=description;
    hint.hidden=true;
    row.append(button,hint);
  });
}
const openModalWithProgrammeHelp=window.openModal;
window.openModal=function(type){
  openModalWithProgrammeHelp(type);
  if(type==='new-programme')enhanceProgrammeBuilder();
};
window.toggleProgrammeFieldHelp=toggleProgrammeFieldHelp;

function recordingManagerMarkup(programme,sessions){
  const selected=sessions.find(session=>Number(session.id)===Number(selectedSessionId));
  const availableSession=selected||sessions.find(session=>!session.recording_file)||sessions[0];
  if(availableSession)selectedSessionId=Number(availableSession.id);
  const keepAvailable=availableSession?.recording_file?!!availableSession.recording_no_expiry:true;
  const currentVideo=availableSession?.recording_file
    ?`<div class="current-recording-preview"><video muted playsinline preload="metadata" src="/api/sessions/${availableSession.id}/recording?token=${encodeURIComponent(authToken)}"></video><div><b>Video is published</b><small>${esc(availableSession.title)} · participants can watch it from this programme.</small></div><span class="badge">Ready</span></div>`
    :'<div class="upload-empty-state"><span aria-hidden="true">▶</span><b>No video for this session yet</b><small>Live recordings and uploaded videos will appear here after they are saved.</small></div>';
  return recordingUploadMarkup(`<section class="card recording-manager programme-recording-manager"><div class="recording-manager-heading"><div><span class="eyebrow">VIDEO LIBRARY</span><h2>Publish or replace a class video</h2><p>Choose a session to upload a video or captions. A recording saved from a live class is also listed above.</p></div><span class="recording-cloud-icon" aria-hidden="true">↑</span></div><div class="field"><label for="programme-recording-session">Session</label><select id="programme-recording-session" ${sessions.length?'':'disabled'} onchange="selectProgrammeRecordingSession(this.value)">${sessions.map(session=>`<option value="${session.id}" ${Number(session.id)===Number(availableSession?.id)?'selected':''}>${esc(session.title)}${session.recording_file?' · video available':''}</option>`).join('')||'<option value="">Create a session first</option>'}</select></div>${currentVideo}<div class="recording-upload-grid"><label class="upload-dropzone" for="class-recording-file"><span class="upload-cloud" aria-hidden="true">↑</span><b>Choose a video to upload</b><small>MP4, WebM or Ogg · up to 1 GB</small><span class="btn btn-outline btn-small">Browse videos</span><input id="class-recording-file" type="file" accept="video/webm,video/mp4,video/ogg,.webm,.mp4,.ogv" onchange="previewRecordingUpload(this)"><span id="recording-file-name" class="upload-file-name">No video selected</span></label><div class="recording-publish-options"><label class="caption-upload-label"><span><b>Optional captions</b><small>Add a WebVTT file for accessible playback.</small></span><input id="class-caption-file" type="file" accept=".vtt,text/vtt" onchange="previewCaptionUpload(this)"><span id="caption-file-name" class="row-meta">No captions selected</span></label><label class="toggle recording-availability"><input id="recording-keep-available" type="checkbox" ${keepAvailable?'checked':''} onchange="setRecordingAvailability(this)" ${availableSession?.recording_file?'':'disabled'}><span><b>Keep video available without an expiry date</b><small>Otherwise, it follows the session recording deadline.</small></span></label><button class="btn btn-soft btn-small" type="button" onclick="generateRecordingCaptions()" ${availableSession?.recording_file?'':'disabled'}>Generate auto captions</button><small>Local captions need FFmpeg and the optional Whisper model.</small><button id="upload-recording-button" class="btn btn-primary" type="button" onclick="uploadClassRecording()" ${availableSession?'':'disabled'}>Publish video to programme</button><div id="recording-upload-progress" class="recording-upload-progress" hidden><div class="progress"><i id="recording-upload-progress-bar" style="width:0%"></i></div><span id="recording-upload-progress-label">Preparing upload…</span></div></div></div></section>`);
}
function selectProgrammeRecordingSession(value){
  selectedSessionId=Number(value)||null;
  const drawerOpen=$('#class-upload-drawer')?.open||false;
  renderReal();
  const drawer=$('#class-upload-drawer');
  if(drawer&&drawerOpen)drawer.open=true;
}
function openProgrammeClasses(programmeId){
  const programme=state.programmes.find(item=>Number(item.id)===Number(programmeId));
  if(!programme)return toast('Programme not found.');
  if(!usesProgrammeClasses(programme))return toast('This activity does not have a classes workspace.');
  if(selectedProgrammeId!==Number(programme.id))programmeSessionQuery='';
  selectedProgrammeId=programme.id;
  const sessions=state.sessionsByProgramme?.[programme.id]||[];
  selectedSessionId=sessions.find(session=>!session.recording_file)?.id||sessions[0]?.id||null;
  page='Programme Classes';
  renderReal();
}
function startProgrammeLiveSession(sessionId,programmeId){
  if(state.programmes.find(item=>Number(item.id)===Number(programmeId))?.status==='completed'){page='Programme Classes';renderReal();return toast('This programme has ended. Live classes are no longer available.');}
  selectedProgrammeId=Number(programmeId);
  selectedSessionId=Number(sessionId);
  page='Live Class';
  renderReal();
}
function selectProgrammeLiveSession(value){
  selectedSessionId=Number(value)||null;
  renderReal();
}
function programmeLiveLauncher(programme,sessions){
  const liveSessions=sessions.filter(session=>session.kind==='live_online');
  const selected=liveSessions.find(session=>Number(session.id)===Number(selectedSessionId))||liveSessions.find(session=>session.live_state!=='live')||liveSessions[0];
  if(selected)selectedSessionId=Number(selected.id);
  return `<section class="card programme-live-launcher"><div class="programme-live-launcher-icon" aria-hidden="true">${lucideIcon('video',22)}</div><div class="programme-live-launcher-copy"><span class="eyebrow">LIVE CLASS</span><h2>Go live with this programme</h2><p>Choose a scheduled online session. Recording is optional and can be turned on before you start.</p></div><div class="programme-live-launcher-controls"><label class="field"><span>Live session</span><select class="select" onchange="selectProgrammeLiveSession(this.value)" ${liveSessions.length?'':'disabled'}>${liveSessions.map(session=>`<option value="${session.id}" ${Number(session.id)===Number(selected?.id)?'selected':''}>${esc(session.title)} · ${dateLabel(session.scheduled_start)}</option>`).join('')||'<option value="">No live online sessions scheduled</option>'}</select></label><button class="btn btn-primary" onclick="startProgrammeLiveSession(${Number(selected?.id)||0},${programme.id})" ${selected?'':'disabled'}>${lucideIcon('video',17)} Open live class controls</button></div></section>`;
}
function programmeClassesPage(){
  const programme=state.programmes.find(item=>Number(item.id)===Number(selectedProgrammeId));
  if(!programme)return `${head('PROGRAMME CLASSES','Programme not found','Choose a programme to view its sessions and class videos.','<button class="btn btn-outline" onclick="go(\'Programmes\')">← Back to programmes</button>')}${emptyCard('Programme unavailable','This programme may have been removed. Return to Programmes to choose another.')}`;
  const sessions=state.sessionsByProgramme?.[programme.id]||[];
  const cards=sessions.length?sessions.map(session=>{const search=`${session.title} ${session.kind} ${session.scheduled_start} ${session.scheduled_end} ${session.live_state||''} ${session.recording_file?'video available recording':'video not uploaded'}`.toLowerCase();return `<article class="card programme-class-card" data-session-search="${esc(search)}"><div class="programme-class-video">${session.recording_file?`<video controls playsinline preload="metadata" aria-label="${esc(session.title)} class video" src="/api/sessions/${session.id}/recording?token=${encodeURIComponent(authToken)}"></video>`:'<div class="programme-class-placeholder"><span aria-hidden="true">▶</span><b>No video yet</b><small>When a live session is recorded or a video is uploaded, it will appear here.</small></div>'}</div><div class="programme-class-copy"><span class="eyebrow">${esc(session.kind.replaceAll('_',' '))}</span><h3>${esc(session.title)}</h3><p>${dateLabel(session.scheduled_start)} · ${dateLabel(session.scheduled_end)}</p><div class="programme-class-actions">${session.recording_file?'<span class="badge">Video available</span>':'<span class="badge orange">Video not uploaded</span>'}${session.kind==='live_online'?`<button class="btn btn-outline btn-small" onclick="startProgrammeLiveSession(${session.id},${programme.id})">Live controls</button>`:''}<button class="btn btn-outline btn-small" onclick="selectProgrammeRecordingSession(${session.id});document.getElementById('programme-recording-session')?.scrollIntoView({behavior:'smooth',block:'center'})">Publish video</button></div></div></article>`;}).join(''):'<div class="empty programme-classes-empty">No classes have been added yet. Add sessions before publishing videos.</div>';
  const search=sessions.length?`<div class="programme-session-search"><input class="search" type="search" placeholder="Search this programme’s sessions and videos" aria-label="Search programme sessions" value="${esc(programmeSessionQuery)}" oninput="filterProgrammeSessions(this.value,'organiser')"><span class="row-meta">Search session titles, dates, live status, or video availability</span></div>`:'';
  return `${head('PROGRAMME CLASSES',esc(programme.title),'Sessions, live recordings, and uploaded class videos for this programme.',`<button class="btn btn-outline" onclick="go('Programmes')">← All programmes</button><button class="btn btn-outline" onclick="editProgrammeDetails(${programme.id})">Edit programme</button><button class="btn btn-primary" onclick="manageProgrammeSessions(${programme.id})">Manage sessions</button>`)}${recordingManagerMarkup(programme,sessions)}${programmeLiveLauncher(programme,sessions)}<section class="programme-class-library"><div class="programme-library-heading"><div><span class="eyebrow">CLASSES & RECORDINGS</span><h2><span id="programme-class-count">${sessions.length} session${sessions.length===1?'':'s'}</span> · ${sessions.filter(session=>session.recording_file).length} video${sessions.filter(session=>session.recording_file).length===1?'':'s'}</h2><p>Every saved live recording and uploaded video is shown with its session.</p></div></div>${search}<div class="empty class-session-search-empty" hidden>No sessions match your search.</div><div class="programme-class-grid">${cards}</div></section>`;
}
const setProgrammeQueryBeforeCardBinding=window.setProgrammeQuery;
window.setProgrammeQuery=function(value){
  if(role==='participant'&&page==='Discover'){window.programmeQuery=value;const results=$('#discover-results');if(results){results.innerHTML=discoverSection==='programmes'?programmeCardsReal():organisationCardsDiscover();loadProgrammeImages(results);}return;}
  setProgrammeQueryBeforeCardBinding(value);
  bindOrganisationProgrammeCards();
};
const organiserLiveClassWithVideoLibrary=organiserLiveClass;
organiserLiveClass=function(){
  return organiserLiveClassWithVideoLibrary().replace(/<section class="card recording-upload-card recording-manager">[\s\S]*?<\/section>/,'');
};
const organizerPageBeforeProgrammeClasses=window.organizerPage;
window.organizerPage=function(){
  if(page==='Programme Classes')return programmeClassesPage();
  return organizerPageBeforeProgrammeClasses();
};
function bindOrganisationProgrammeCards(){
  if(role!=='organiser'||page!=='Programmes')return;
  const visible=(state.programmes||[]).filter(programme=>(programmeFilter==='All'||programme.category===programmeFilter)&&(!window.programmeQuery||`${programme.title} ${programme.category} ${programme.location}`.toLowerCase().includes(window.programmeQuery.toLowerCase())));
  document.querySelectorAll('.programme-cards .programme-card').forEach((card,index)=>{
    const programme=visible[index];
    if(!programme)return;
    if(!usesProgrammeClasses(programme))return;
    card.tabIndex=0;
    card.setAttribute('role','button');
    card.setAttribute('aria-label',`Open classes for ${programme.title}`);
    card.title='Open programme classes and videos';
    card.addEventListener('click',event=>{
      if(event.target.closest('button,a,input,select,textarea,label'))return;
      openProgrammeClasses(programme.id);
    });
    card.addEventListener('keydown',event=>{
      if(event.target!==card||!['Enter',' '].includes(event.key))return;
      event.preventDefault();
      openProgrammeClasses(programme.id);
    });
  });
}
const renderBeforeProgrammeClasses=renderReal;
renderReal=function(){
  renderBeforeProgrammeClasses();
  bindOrganisationProgrammeCards();
};
window.render=renderReal;
window.openProgrammeClasses=openProgrammeClasses;
window.selectProgrammeRecordingSession=selectProgrammeRecordingSession;
window.startProgrammeLiveSession=startProgrammeLiveSession;
const addSessionBeforeClassesRefresh=window.addRealSession;
window.addRealSession=async function(event,programmeId){
  const isOnClassesPage=page==='Programme Classes';
  const previousCount=(state.sessionsByProgramme?.[programmeId]||[]).length;
  await addSessionBeforeClassesRefresh(event,programmeId);
  const nextCount=(state.sessionsByProgramme?.[programmeId]||[]).length;
  if(isOnClassesPage&&nextCount>previousCount){
    closeModal();
    await hydrateReal();
    renderReal();
  }
};
const deleteSessionBeforeClassesRefresh=window.deleteSessionReal;
window.deleteSessionReal=async function(sessionId,programmeId){
  const isOnClassesPage=page==='Programme Classes';
  await deleteSessionBeforeClassesRefresh(sessionId,programmeId);
  if(isOnClassesPage&&!(state.sessionsByProgramme?.[programmeId]||[]).some(session=>Number(session.id)===Number(sessionId))){
    closeModal();
    await hydrateReal();
    renderReal();
  }
};
const editProgrammeBeforeCategorySelect=window.editProgrammeDetails;
window.editProgrammeDetails=function(programmeId){
  editProgrammeBeforeCategorySelect(programmeId);
  const input=$('#edit-category');
  if(!input||input.tagName==='SELECT')return;
  const value=input.value;
  const select=document.createElement('select');
  select.id='edit-category';
  select.required=true;
  const options=programmeCategoryOptions.includes(value)?programmeCategoryOptions:[value,...programmeCategoryOptions];
  select.innerHTML=options.map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join('');
  select.value=value;
  input.replaceWith(select);
};

const participantMessagesBeforeGroups=window.participantMessages;
const organizerPageBeforeGroups=window.organizerPage;
const goBeforeSimpleNavigation=window.go;
const logoutBeforeGroups=window.logout;
window.logout=function(){
  messagesSection='chats';selectedGroupProgrammeId=null;state.groups=[];state.groupMessages=[];state.groupMembers=[];state.selectedGroup=null;selectedGroupMemberProfile=null;
  return logoutBeforeGroups();
};
window.go=function(next){
  if(next==='Attendance'){peopleSection='attendance';next='Participants';}
  else if(next==='Participants')peopleSection='participants';
  return goBeforeSimpleNavigation(next);
};
const goBeforeGalleryPage=window.go;
window.go=function(next){const result=goBeforeGalleryPage(next);if(next==='Gallery'&&role==='organiser')loadOrganisationGallery();return result;};
Object.assign(window,{createGalleryAlbum,renameGalleryAlbum,deleteGalleryAlbum,uploadGalleryMedia,openPublicGalleryAlbum,closeGalleryViewer,selectGalleryMedia,moveGalleryMedia,postGalleryComment});
function peopleWorkspace(){return `<div class="people-section-switch" role="tablist" aria-label="People and attendance"><button class="filter ${peopleSection==='participants'?'active':''}" role="tab" aria-selected="${peopleSection==='participants'}" onclick="setPeopleSection('participants')">Participants</button><button class="filter ${peopleSection==='attendance'?'active':''}" role="tab" aria-selected="${peopleSection==='attendance'}" onclick="setPeopleSection('attendance')">Attendance</button></div>${peopleSection==='attendance'?attendanceReal():participantsReal()}`;}
function setPeopleSection(section){peopleSection=section==='attendance'?'attendance':'participants';if(peopleSection==='participants')hydrateReal().then(renderReal);else api('/api/attendance').then(rows=>{state.attendance=rows;renderReal();}).catch(error=>toast(error.message));}
async function openProgrammeGroup(programmeId){
  const id=Number(programmeId);
  if(!Number.isInteger(id)||id<1)return toast('This programme group could not be opened.');
  const group=(state.groups||[]).find(item=>Number(item.programme_id)===id);
  if(!group)return toast('This programme group is no longer available to your account.');
  const requestId=++groupLoadSequence;
  messagesSection='groups';participantMessagesSection='chats';
  participantAiChatOpen=false;activeOrganisationAiId=null;
  selectedDirectConversationId=null;selectedConversationId=null;
  messageView='inbox';conversationId=null;state.messages=[];state.participantDirectMessages=[];
  selectedGroupProgrammeId=id;state.selectedGroup=group;
  state.groupMessages=[];state.groupMembers=[];page='Messages';
  renderReal();
  try{
    const [messages,members]=await Promise.all([api(`/api/groups/${id}/messages`),api(`/api/groups/${id}/members`)]);
    if(requestId!==groupLoadSequence)return;
    selectedGroupProgrammeId=id;state.groupMessages=messages;state.groupMembers=members;state.selectedGroup=group;
    renderReal();
  }catch(error){
    if(requestId!==groupLoadSequence)return;
    toast(error.message||'Could not open this programme group.');
  }
}
function backToProgrammeGroups(){groupLoadSequence++;selectedGroupProgrammeId=null;state.selectedGroup=null;state.groupMessages=[];state.groupMembers=[];renderReal();}
function groupInitials(name=''){return esc(initials(name)||'V');}
function groupMessageRows(programmeId,messages){
  if(!messages?.length)return '<div class="group-empty"><b>Start this programme group</b><span>Share a helpful update with approved participants.</span></div>';
  return messages.map(message=>`<article class="group-message"><button class="group-message-author" onclick="openGroupMemberProfile(${programmeId},${Number(message.user_id)||0})" ${message.user_id?'':'disabled'}><span class="group-author-avatar">${groupInitials(message.user_name||'Former member')}</span><b>${esc(message.user_name||'Former member')}</b></button><p>${esc(message.body)}</p><time>${new Date(message.created_at).toLocaleString()}</time></article>`).join('');
}
function groupMemberRows(programmeId,members){
  if(!members?.length)return '<div class="empty">Approved participants appear here.</div>';
  return members.map(member=>`<button class="group-member-row" onclick="openGroupMemberProfile(${programmeId},${member.id})"><span class="group-author-avatar">${groupInitials(member.name)}</span><span><b>${esc(member.name)}</b><small>${member.is_admin?'Group admin · ':''}${Number(member.courses_approved)||0} active programme${Number(member.courses_approved)===1?'':'s'}</small></span><span class="text-link">Profile</span></button>`).join('');
}
function groupAdminTools(group,members){
  if(role==='participant'&&!group?.is_admin)return '';
  return `<details class="group-admin-tools"><summary>Group settings</summary><label class="toggle group-admin-toggle"><input id="group-admin-only" type="checkbox" ${group?.admin_only?'checked':''} onchange="saveGroupPostingMode(${group.programme_id},this.checked)"><span><b>Only admins can send messages</b><small>Participants can still read the group.</small></span></label>${role!=='participant'?`<div class="group-appointment"><b>Appoint participant admins</b><small>Selected approved members can post when admin-only mode is on.</small>${members.map(member=>`<label class="toggle"><input type="checkbox" data-group-admin-option value="${member.id}" ${member.is_admin?'checked':''}><span>${esc(member.name)}</span></label>`).join('')}<button class="btn btn-outline btn-small" onclick="saveGroupAdmins(${group.programme_id})">Save admins</button></div>`:''}</details>`;
}
function programmeGroupsPanel(participant=false){
  if(participant)return realParticipantMessages();
  const groups=state.groups||[];const active=groups.find(group=>Number(group.programme_id)===Number(selectedGroupProgrammeId));
  if(active)state.selectedGroup=active;
  const messageSectionButtons=`<div class="inbox-section-switch" role="tablist" aria-label="Messages and groups"><button class="${messagesSection==='chats'?'active':''}" role="tab" aria-selected="${messagesSection==='chats'}" onclick="setMessagesSection('chats')">Private chats</button><button class="${messagesSection==='groups'?'active':''}" role="tab" aria-selected="${messagesSection==='groups'}" onclick="setMessagesSection('groups')">Groups <span>${groups.length}</span></button></div>`;
  const groupList=groups.length?groups.map(group=>`<button class="group-list-item ${Number(group.programme_id)===Number(selectedGroupProgrammeId)?'active':''}" onclick="openProgrammeGroup(${group.programme_id})"><span class="group-list-avatar">#</span><span class="group-list-copy"><b>${esc(group.programme_title)}</b><small>${group.member_count} approved participant${group.member_count===1?'':'s'} · ${group.admin_only?'admins only':'everyone can post'}</small><small class="group-list-last">${esc(group.last_message||'Start the group conversation')}</small></span></button>`).join(''):'<div class="empty">Programme groups are created automatically. Organisers will see each programme here; participants see a group after their enrolment is approved.</div>';
  if(messagesSection==='chats')return `${messageSectionButtons}${participant?realParticipantMessages():organiserMessagesReal()}`;
  if(active)return `<section class="organiser-group-chat-page card group-chat-panel"><header class="group-chat-header"><button class="group-back-button" onclick="backToProgrammeGroups()">← All groups</button><span class="group-list-avatar">#</span><div><h1>${esc(active.programme_title)}</h1><small>${active.member_count} approved participants · ${active.admin_only?'Only admins can post':'All group members can post'}</small></div><button class="btn btn-outline btn-small" onclick="toggleGroupMembers()">Members</button></header>${active.admin_only?'<div class="group-announcement">Admin-only posting is on. Everyone in the group can read messages.</div>':''}<div class="group-chat-layout"><div class="group-messages" id="group-messages">${groupMessageRows(active.programme_id,state.groupMessages||[])}</div><aside class="group-member-list" id="group-member-list"><h3>Approved members</h3>${groupMemberRows(active.programme_id,state.groupMembers||[])}</aside></div>${groupAdminTools(active,state.groupMembers||[])}<form class="group-compose" onsubmit="sendProgrammeGroupMessage(event,${active.programme_id})"><textarea id="group-message-input" maxlength="4000" aria-label="Write to everyone in this group" placeholder="${active.admin_only&&!active.is_admin?'Admins are the only people who can send messages':'Write to everyone in this group'}" ${active.admin_only&&!active.is_admin?'disabled':''} required></textarea><button class="btn btn-primary" ${active.admin_only&&!active.is_admin?'disabled':''}>Send</button></form></section>`;
  return `${messageSectionButtons}<section class="groups-workspace"><aside class="card groups-list"><div class="groups-heading"><div><h2>Programme groups</h2><p>A group is automatically created for each programme.</p></div><span class="badge">${groups.length}</span></div>${groupList}</aside><section class="card group-chat-panel"><div class="group-chat-empty"><span class="group-list-avatar">#</span><h2>Your programme groups</h2><p>Choose a group to open its full-page conversation. Groups include approved and completed participants only.</p></div></section></section>`;
}
function setMessagesSection(section){
  groupLoadSequence++;
  messagesSection=section==='groups'?'groups':section==='organisation'&&role==='participant'?'organisation':'chats';
  selectedGroupProgrammeId=null;state.selectedGroup=null;state.groupMessages=[];state.groupMembers=[];
  if(messagesSection==='groups'){
    participantAiChatOpen=false;activeOrganisationAiId=null;
    selectedDirectConversationId=null;selectedConversationId=null;
    messageView='inbox';conversationId=null;state.messages=[];state.participantDirectMessages=[];
  }
  renderReal();
}
async function sendProgrammeGroupMessage(event,programmeId){event.preventDefault();const input=$('#group-message-input');const body=input?.value.trim();if(!body)return;try{const message=await api(`/api/groups/${programmeId}/messages`,{method:'POST',body:JSON.stringify({body})});state.groupMessages=[...(state.groupMessages||[]),message];input.value='';renderReal();}catch(error){toast(error.message);}}
async function saveGroupPostingMode(programmeId,adminOnly){try{const result=await api(`/api/groups/${programmeId}/settings`,{method:'PATCH',body:JSON.stringify({admin_only:adminOnly})});state.selectedGroup={...state.selectedGroup,...result};state.groups=(state.groups||[]).map(group=>Number(group.programme_id)===Number(programmeId)?{...group,...result}:group);renderReal();toast(adminOnly?'Only group admins can post now.':'All approved group members can post now.');}catch(error){toast(error.message);renderReal();}}
async function saveGroupAdmins(programmeId){const userIds=[...document.querySelectorAll('[data-group-admin-option]:checked')].map(input=>Number(input.value));try{const admins=await api(`/api/groups/${programmeId}/admins`,{method:'PUT',body:JSON.stringify({user_ids:userIds})});state.groupMembers=(state.groupMembers||[]).map(member=>({...member,is_admin:admins.some(admin=>admin.id===member.id)}));state.groups=(state.groups||[]).map(group=>Number(group.programme_id)===Number(programmeId)?{...group,admins,is_admin:true}:group);state.selectedGroup={...state.selectedGroup,is_admin:true,admins};renderReal();toast('Programme group admins updated.');}catch(error){toast(error.message);}}
function toggleGroupMembers(){const list=$('#group-member-list');if(list)list.classList.toggle('show-mobile');}
async function openGroupMemberProfile(programmeId,memberId){if(!memberId)return;try{const member=await api(`/api/groups/${programmeId}/members/${memberId}`);selectedGroupMemberProfile={...member,programme_id:programmeId};renderGroupMemberProfile();}catch(error){toast(error.message);}}
function renderGroupMemberProfile(){const member=selectedGroupMemberProfile;if(!member)return;document.querySelector('.group-member-profile-backdrop')?.remove();document.body.insertAdjacentHTML('beforeend',`<div class="modal-back group-member-profile-backdrop" onclick="if(event.target===this)closeGroupMemberProfile()"><section class="modal group-member-profile" role="dialog" aria-modal="true" aria-labelledby="group-member-title"><div class="modal-top"><div><span class="eyebrow">PROGRAMME MEMBER</span><h2 id="group-member-title">${esc(member.name)}</h2><p>${esc(member.area||'Community not added')} · ${esc(member.programme_title)}</p></div><button class="close" onclick="closeGroupMemberProfile()" aria-label="Close participant profile">×</button></div><div class="group-profile-identity"><span class="group-profile-avatar">${member.image_available?'<img data-group-member-photo alt="">':groupInitials(member.name)}</span><div><b>${esc(member.name)}</b><small>${esc(member.area||'')}</small></div></div><div class="group-profile-stats"><div><b>${member.courses_applied}</b><small>Applied</small></div><div><b>${member.courses_approved}</b><small>Approved</small></div><div><b>${member.courses_completed}</b><small>Completed</small></div><div><b>${percent(member.average_attendance)}</b><small>Attendance</small></div></div><div class="modal-actions"><button class="btn btn-outline" onclick="closeGroupMemberProfile()">Close profile</button></div></section></div>`);if(member.image_available)loadGroupMemberPhoto(member);}
async function loadGroupMemberPhoto(member){const image=$('.group-member-profile [data-group-member-photo]');if(!image)return;try{const response=await fetch(`/api/groups/${member.programme_id}/members/${member.id}/photo`,{headers:{Authorization:`Bearer ${authToken}`}});if(!response.ok)throw new Error(`Profile image request returned ${response.status}.`);image.src=URL.createObjectURL(await response.blob());}catch(error){if(error.message!=='Profile image request returned 404.')console.warn('Could not load group member photo:',error.message);}}
function closeGroupMemberProfile(){document.querySelector('.group-member-profile-backdrop')?.remove();selectedGroupMemberProfile=null;}
async function syncGroupMessages(){if(groupPollInFlight||!authToken||page!=='Messages'||messagesSection!=='groups'||!selectedGroupProgrammeId||document.visibilityState==='hidden')return;groupPollInFlight=true;try{const latest=await api(`/api/groups/${selectedGroupProgrammeId}/messages`);const before=JSON.stringify(state.groupMessages||[]);state.groupMessages=latest;if(before!==JSON.stringify(latest)){const input=$('#group-message-input');if(!input||document.activeElement!==input)renderReal();}}catch(error){console.warn('Could not refresh programme group:',error.message);}finally{groupPollInFlight=false;}}
function removeProgrammeRecording(sessionId){const session=Object.values(state.sessionsByProgramme||{}).flat().find(item=>Number(item.id)===Number(sessionId));if(!session?.recording_file)return toast('No published video is attached to this session.');if(!window.confirm(`Delete the published video for “${session.title}”? The session and attendance records will remain.`))return;api(`/api/sessions/${sessionId}/recording`,{method:'DELETE'}).then(async()=>{await hydrateReal();renderReal();toast('Published video deleted.');}).catch(error=>toast(error.message));}
function programmeClassesPageWithQuickUpload(){
  let html=programmeClassesPageBeforeControls();
  html=html.replace(`onclick="go('Programmes')">← All programmes`,`onclick="go('Programmes')">← All programmes</button><button class="btn btn-outline" onclick="openProgrammeGroup(${selectedProgrammeId})"># Group chat`);
  const managerStart=html.indexOf('<section class="card recording-manager programme-recording-manager">');
  const managerEnd=managerStart>=0?html.indexOf('</section>',managerStart)+10:-1;
  if(managerStart<0||managerEnd<managerStart)return html;
  const manager=html.slice(managerStart,managerEnd);
  const managerWithTitle=manager.replace('<h2>Publish or replace a class video</h2>','<h2>Upload or replace a class video</h2>');
  const quickPanel=`<details class="class-upload-drawer" id="class-upload-drawer"><summary><span class="add-video-plus">＋</span><span><b>Upload a class video</b><small>Choose a session and publish its video here</small></span></summary>${managerWithTitle}</details>`;
  const libraryStart=html.indexOf('<section class="programme-class-library">');
  const libraryEnd=html.indexOf('</section>',libraryStart)+10;
  let result=html.slice(0,managerStart)+html.slice(managerEnd);
  const revisedLibraryStart=result.indexOf('<section class="programme-class-library">');
  const revisedLibraryEnd=result.indexOf('</section>',revisedLibraryStart)+10;
  return result.slice(0,revisedLibraryStart)+quickPanel+result.slice(revisedLibraryStart);
}
const programmeClassesPageBeforeControls=programmeClassesPage;
programmeClassesPage=programmeClassesPageWithQuickUpload;
const programmeClassesPageBeforeQuickFab=programmeClassesPage;
function openRecordingUpload(sessionId){if(state.programmes.find(item=>Number(item.id)===Number(selectedProgrammeId))?.status==='completed')return toast('This programme has ended. You can no longer upload videos.');selectedSessionId=Number(sessionId);renderReal();const drawer=$('#class-upload-drawer');if(drawer){drawer.open=true;drawer.scrollIntoView({behavior:'smooth',block:'center'});}}
programmeClassesPage=function(){
  const html=programmeClassesPageBeforeQuickFab();
  const matches=[...html.matchAll(/<button class="btn btn-outline btn-small" onclick="selectProgrammeRecordingSession\((\d+)\);document\.getElementById\('programme-recording-session'\)\?\.scrollIntoView\(\{behavior:'smooth',block:'center'\}\)">Publish video<\/button>/g)];
  let result=html;
  for(const match of matches){const sessionId=Number(match[1]);const session=Object.values(state.sessionsByProgramme||{}).flat().find(item=>item.id===sessionId);const video=session?.recording_file;const attendance=session?.kind==='physical'?`<button class="btn btn-soft btn-small" onclick="openPhysicalAttendance(${selectedProgrammeId},${sessionId})">Check attendance</button>`:'';const action=video?`${attendance}<button class="btn btn-danger btn-small" onclick="removeProgrammeRecording(${sessionId})">Delete video</button>`:`${attendance}<button class="btn btn-outline btn-small" onclick="openRecordingUpload(${sessionId})">＋ Upload video</button>`;result=result.replace(match[0],action);}
  return result;
};
const participantDiscoverBeforePublicCounts=participantDiscoverReal;
participantDiscoverReal=function(){
  const markup=participantDiscoverBeforePublicCounts();
  if(role!=='participant'||selectedOrganisationId===null||!state.organisationDetail)return markup;
  return (state.organisationDetail.programmes||[]).reduce((content,programme)=>{
    if(programme.enrolled_count===null||programme.enrolled_count===undefined)return content;
    return content.replace(`<h3>${esc(programme.title)}</h3>`,`<h3>${esc(programme.title)}</h3>${publicEnrollmentLabel(programme)}`);
  },markup);
};
window.participantDiscover=participantDiscoverReal;
window.organizerPage=function(){if(page==='Programme Classes')return programmeClassesPage();if(page==='Participants')return peopleWorkspace();if(page==='Follow-Up')return followupReal();if(page==='Messages')return programmeGroupsPanel(false);return organizerPageBeforeGroups();};
window.participantMessages=function(){return programmeGroupsPanel(true);};
window.render=renderReal;
setInterval(syncGroupMessages,5000);

const settingsRealBeforePhotoControls=settingsReal;
settingsReal=function(){
  let html=settingsRealBeforePhotoControls();
  if(state.accountProfile?.image_available)html=html.replace('</label><small>PNG, JPEG or WebP · no size limit</small></div><form onsubmit="saveAccountDetails(event)">','</label><small>PNG, JPEG or WebP · no size limit</small><button class="btn btn-outline btn-small" type="button" onclick="removeAccountPhoto()">Remove photo</button></div><form onsubmit="saveAccountDetails(event)">');
  return html;
};
const settingsRealBeforeOrganisationLinks=settingsReal;
function captureOrganisationProfileSections(){
  return [...document.querySelectorAll('.organisation-page-section-editor')].map(editor=>({
    title:editor.querySelector('[data-profile-section-title]').value,
    body:editor.querySelector('[data-profile-section-body]').value
  }));
}
function renderOrganisationProfileSectionFields(sections){
  return sections.map((section,index)=>`<fieldset class="organisation-page-section-editor"><legend>Section ${index+1}</legend><div class="field"><label for="organisation-section-title-${index}">Section heading</label><input id="organisation-section-title-${index}" data-profile-section-title maxlength="80" minlength="2" value="${esc(section.title||'')}" required></div><div class="field"><label for="organisation-section-body-${index}">Section text</label><textarea id="organisation-section-body-${index}" data-profile-section-body maxlength="1600" rows="4" required>${esc(section.body||'')}</textarea></div><div class="organisation-page-section-actions"><button class="btn btn-outline btn-small" type="button" onclick="moveOrganisationProfileSection(${index},-1)" ${index===0?'disabled':''}>Move up</button><button class="btn btn-outline btn-small" type="button" onclick="moveOrganisationProfileSection(${index},1)" ${index===sections.length-1?'disabled':''}>Move down</button><button class="btn btn-soft btn-small" type="button" onclick="removeOrganisationProfileSection(${index})">Remove section</button></div></fieldset>`).join('');
}
function organisationProfileSectionsEditor(sections,slug,publicPageAvailable){
  const items=Array.isArray(sections)?sections:[];
  return `<section class="organisation-page-builder"><div class="organisation-page-builder-head"><div><h3>Build your public page</h3><p class="row-meta">Add up to eight text sections, such as your vision, mission, or community impact. Content is displayed as text, not HTML.</p></div>${slug&&publicPageAvailable?`<a class="btn btn-outline btn-small" href="/organisations/${encodeURIComponent(slug)}" target="_blank" rel="noopener noreferrer">Preview public page</a>`:''}</div><div id="organisation-profile-sections">${renderOrganisationProfileSectionFields(items)}</div><button id="add-organisation-profile-section" class="btn btn-outline btn-small" type="button" onclick="addOrganisationProfileSection()" ${items.length>=8?'disabled':''}>Add a section · ${items.length}/8</button></section>`;
}
function refreshOrganisationProfileSections(sections){
  const container=document.getElementById('organisation-profile-sections');
  const addButton=document.getElementById('add-organisation-profile-section');
  if(container)container.innerHTML=renderOrganisationProfileSectionFields(sections);
  if(addButton){addButton.disabled=sections.length>=8;addButton.textContent=`Add a section · ${sections.length}/8`;}
}
function mutateOrganisationProfileSections(change){
  const sections=captureOrganisationProfileSections();
  change(sections);
  state.settings={...state.settings,profile_sections:sections};
  refreshOrganisationProfileSections(sections);
}
function addOrganisationProfileSection(){mutateOrganisationProfileSections(sections=>{if(sections.length<8)sections.push({title:'',body:''});});}
function removeOrganisationProfileSection(index){mutateOrganisationProfileSections(sections=>sections.splice(index,1));}
function moveOrganisationProfileSection(index,direction){
  mutateOrganisationProfileSections(sections=>{
    const target=index+direction;
    if(target<0||target>=sections.length)return;
    [sections[index],sections[target]]=[sections[target],sections[index]];
  });
}
settingsReal=function(){
  let html=settingsRealBeforeOrganisationLinks();
  const s=state.settings||{},social=s.social_links||{};
  const fields=`<div class="field"><label for="organisation-description">Organisation description</label><textarea id="organisation-description" rows="4" maxlength="2000" placeholder="Tell participants what your organisation does.">${esc(s.description||'')}</textarea></div><div class="field"><label for="organisation-location">Location</label><input id="organisation-location" maxlength="160" value="${esc(s.location||'')}" placeholder="City, region or community"></div><div class="field"><label for="organisation-contact-email">Contact email</label><input id="organisation-contact-email" type="email" maxlength="254" value="${esc(s.contact_email||'')}" placeholder="hello@example.org"></div><div class="field"><label for="organisation-contact-phone">Contact phone</label><input id="organisation-contact-phone" type="tel" maxlength="40" value="${esc(s.contact_phone||'')}" placeholder="+1 555 0100"></div><div class="field"><label for="organisation-website">Website URL</label><input id="organisation-website" type="url" maxlength="300" value="${esc(s.website_url||'')}" placeholder="https://example.org"></div><div class="organisation-social-settings"><b>Social media links</b>${[['facebook','Facebook'],['instagram','Instagram'],['linkedin','LinkedIn'],['tiktok','TikTok'],['x','X'],['youtube','YouTube']].map(([key,label])=>`<div class="field"><label for="organisation-social-${key}">${label}</label><input id="organisation-social-${key}" type="url" maxlength="300" value="${esc(social[key]||'')}" placeholder="https://${key}.com/your-page"></div>`).join('')}</div>`;
  const bannerSettings=`<div class="organisation-banner-settings"><div><b>Organisation banner</b><span>Shown across the top of your public profile.</span></div>${s.banner_available?'<img data-organisation-banner alt="Organisation banner preview">':'<div class="organisation-banner-placeholder">Add a banner to personalise your public profile</div>'}<div class="organisation-banner-actions"><label class="btn btn-outline btn-small" for="organisation-banner-file">${s.banner_available?'Change banner':'Upload banner'}<input id="organisation-banner-file" type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadOrganisationBanner(this)" hidden></label>${s.banner_available?'<button class="btn btn-outline btn-small" type="button" onclick="removeOrganisationBanner()">Remove banner</button>':''}</div><small>PNG, JPEG or WebP · no size limit</small></div>`;
  html=html.replace('<h2 class="card-title">Organisation profile</h2></div>','<h2 class="card-title">Organisation profile</h2></div>'+bannerSettings);
  if(s.image_available)html=html.replace('</label><small>PNG, JPEG or WebP · no size limit</small></div><form onsubmit="saveOrganisationProfile(event)">','</label><button class="btn btn-outline btn-small" type="button" onclick="removeOrganisationPhoto()">Remove picture</button><small>PNG, JPEG or WebP · no size limit</small></div><form onsubmit="saveOrganisationProfile(event)">');
  html=html.replace('<button class="btn btn-primary btn-small">Save organisation</button>',`${fields}<button class="btn btn-primary btn-small">Save organisation</button>`);
  return html.replace('<button class="btn btn-primary btn-small">Save organisation</button>',`${organisationProfileSectionsEditor(s.profile_sections,s.slug,s.public_page_available)}<button class="btn btn-primary btn-small">Save organisation</button>`);
};
async function uploadOrganisationBanner(input){const file=input.files?.[0];if(!file)return;try{await uploadProtectedImage('/api/settings/banner',file);state.settings={...state.settings,banner_available:true};renderReal();toast('The organisation banner was updated.');}catch(error){toast(error.message||'Could not upload the organisation banner.');}finally{input.value='';}}
async function removeOrganisationPhoto(){if(!state.settings?.image_available||!confirm('Remove the organisation profile picture? The initials placeholder will be shown instead.'))return;try{await api('/api/settings/photo',{method:'DELETE'});state.settings={...state.settings,image_available:false};accountImageLoadSequence++;for(const url of accountImageUrls)URL.revokeObjectURL(url);accountImageUrls.clear();renderReal();toast('The organisation profile picture was removed.');}catch(error){toast(error.message||'Could not remove the organisation profile picture.');}}
async function removeOrganisationBanner(){if(!state.settings?.banner_available||!confirm('Remove the organisation banner? The profile will use its default background instead.'))return;try{await api('/api/settings/banner',{method:'DELETE'});state.settings={...state.settings,banner_available:false};accountImageLoadSequence++;for(const url of accountImageUrls)URL.revokeObjectURL(url);accountImageUrls.clear();renderReal();toast('The organisation banner was removed.');}catch(error){toast(error.message||'Could not remove the organisation banner.');}}
const profileRealBeforePhotoControls=profileReal;
profileReal=function(){
  let html=profileRealBeforePhotoControls();
  if(state.accountProfile?.image_available)html=html.replace('</label></div></div><div class="phone-section-title">Personal details','</label><button class="btn btn-outline btn-small" type="button" onclick="removeAccountPhoto()">Remove photo</button></div></div><div class="phone-section-title">Personal details');
  return html;
};
async function removeAccountPhoto(){
  if(!state.accountProfile?.image_available)return;
  if(!confirm('Remove your profile photo? Your initials will be shown instead.'))return;
  try{
    await api('/api/account/photo',{method:'DELETE'});
    state.accountProfile={...state.accountProfile,image_available:false};currentUser={...currentUser,image_available:false};
    accountImageLoadSequence++;for(const url of accountImageUrls)URL.revokeObjectURL(url);accountImageUrls.clear();
    renderReal();toast('Your profile photo was removed.');
  }catch(error){toast(error.message||'Could not remove the profile photo.');}
}
const logoutBeforePrivateProfileCleanup=logout;
logout=function(){
  selectedDirectConversationId=null;selectedParticipantProfile=null;state.participantDirectMessages=[];state.participantDirectConversations=[];state.participantPeers=[];
  document.querySelector('.participant-profile-backdrop')?.remove();
  logoutBeforePrivateProfileCleanup();
};
window.settings=settingsReal;
window.profile=profileReal;
window.participantMessages=realParticipantMessages;
const participantsBeforeProfileAvatars=participantsReal;
participantsReal=function(){
  return participantsBeforeProfileAvatars().replace(/<span class="mini-avatar">([^<]*)<\/span><button class="participant-profile-link" onclick="openParticipantProfile\((\d+)\)">/g,'<button type="button" class="mini-avatar profile-avatar-button" onclick="openParticipantProfile($2)" aria-label="Open participant profile">$1</button><button class="participant-profile-link" onclick="openParticipantProfile($2)">');
};
const editProgrammeDetailsBeforeEndState=editProgrammeDetails;
editProgrammeDetails=function(programmeId){
  editProgrammeDetailsBeforeEndState(programmeId);
  if(state.programmes.find(item=>Number(item.id)===Number(programmeId))?.status==='completed')$('#edit-status')?.closest('.field')?.remove();
  else $('#edit-status option[value="completed"]')?.remove();
};
const programmeCardsBeforeEndState=programmeCardsReal;
programmeCardsReal=function(){
  const html=programmeCardsBeforeEndState();
  if(role!=='organiser')return html;
  return html.replace(/<article class="card programme-card">[\s\S]*?<\/article>/g,card=>{
    if(!card.includes('· completed</span>'))return card;
    const programme=state.programmes.find(item=>item.status==='completed'&&card.includes(esc(item.title)));
    if(!programme)return card;
    return card.replace(/<div class="programme-actions">[\s\S]*?<\/div>/,`<div class="programme-actions"><button class="btn btn-outline btn-small" onclick="editProgrammeDetails(${programme.id})">Edit details</button><button class="btn btn-outline btn-small" onclick="openProgrammeClasses(${programme.id})">View classes</button></div>`);
  });
};
const programmeClassesPageBeforeEndState=programmeClassesPage;
programmeClassesPage=function(){
  let html=programmeClassesPageBeforeEndState();
  const programme=state.programmes.find(item=>Number(item.id)===Number(selectedProgrammeId));
  if(programme?.status!=='completed')return html;
  html=html.replace(/<details class="class-upload-drawer"[\s\S]*?<\/details>/,'');
  html=html.replace(/<section class="card programme-live-launcher">[\s\S]*?<\/section>/,'');
  html=html.replace(/<button class="btn btn-primary" onclick="manageProgrammeSessions\(\d+\)">Manage sessions<\/button>/,'');
  html=html.replace(/<button class="btn btn-outline btn-small" onclick="startProgrammeLiveSession\([^"]+\)">Live controls<\/button>/g,'');
  html=html.replace(/<button class="btn btn-outline btn-small" onclick="openRecordingUpload\([^"]+\)">[^<]*Upload video<\/button>/g,'');
  html=html.replace('<section class="programme-class-library">','<div class="notice programme-ended-notice"><b>Programme ended</b><br>Existing sessions and videos remain available, but new sessions, live classes, and video uploads are disabled.</div><section class="programme-class-library">');
  return html;
};
const organiserPageBeforeEndedProgrammeGuard=window.organizerPage;
window.organizerPage=function(){
  if(page==='Live Class'&&state.programmes.find(item=>Number(item.id)===Number(selectedProgrammeId))?.status==='completed')page='Programme Classes';
  return organiserPageBeforeEndedProgrammeGuard();
};
setInterval(()=>{if(role==='participant'&&page==='Messages'&&selectedDirectConversationId)loadParticipantDirectMessages(selectedDirectConversationId,true);},4000);
setInterval(async()=>{
  if(role!=='participant'||page!=='Messages'||!authToken)return;
  try{
    const conversations=await api('/api/participant/direct-conversations');
    const changed=JSON.stringify(conversations)!==JSON.stringify(state.participantDirectConversations||[]);
    state.participantDirectConversations=conversations;
    if(changed&&document.activeElement?.id!=='participant-direct-message-input')renderReal();
  }catch(error){console.warn('Could not refresh participant direct conversations:',error.message);}
},5000);

const programmeCardsBeforeParticipantNavigation=programmeCardsReal;
programmeCardsReal=function(){
  const html=programmeCardsBeforeParticipantNavigation();
  if(role!=='participant')return html;
  const programmes=(state.programmes||[]).filter(programme=>{
    if(page==='Discover'){
      if(!['open','ongoing'].includes(String(programme.status).toLowerCase()))return false;
      if(discoverFilters.category!=='all'&&programme.category!==discoverFilters.category)return false;
      if(discoverFilters.format!=='all'&&programme.format!==discoverFilters.format)return false;
      if(discoverFilters.location!=='all'&&programme.location!==discoverFilters.location)return false;
      const full=Number(programme.enrolled_count||0)>=Number(programme.capacity||0);
      if(discoverFilters.availability==='places'&&full)return false;
      if(discoverFilters.availability==='full'&&!full)return false;
    }else if(programmeFilter!=='All'&&programme.category!==programmeFilter)return false;
    return !window.programmeQuery||`${programme.title} ${programme.category} ${programme.location} ${programme.organisation_name||''}`.toLowerCase().includes(window.programmeQuery.toLowerCase());
  });
  let index=0;
  return html.replace(/<article class="card programme-card">([\s\S]*?)<\/article>/g,(card)=>{
    const programme=programmes[index++];
    if(!programme)return card;
    return card.replace('<article class="card programme-card">',`<article class="card programme-card" tabindex="0" aria-label="Open ${esc(programme.title)} programme sessions" onclick="openParticipantProgramme(${programme.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openParticipantProgramme(${programme.id})}">`)
      .replace(/onclick="(apply|openProgrammeConversation)\((\d+)\)"/g,'onclick="event.stopPropagation();$1($2)"')
      .replace(/<span class="badge">((?:applied|waitlisted|enrolled|completed))<\/span>/g,'<span class="badge enrollment-status enrollment-status-$1">$1</span>');
  });
};

const participantProgrammeDetailBeforeSessionDescriptions=participantProgrammeDetail;
participantProgrammeDetail=function(){
  let html=participantProgrammeDetailBeforeSessionDescriptions();
  const sessions=state.sessionsByProgramme?.[participantProgrammeId]||[];
  for(const session of sessions){
    if(session.description)html=html.replace(`<h3>${esc(session.title)}</h3>`,`<h3>${esc(session.title)}</h3><p class="programme-session-description">${esc(session.description)}</p>`);
  }
  return html;
};

function socialPlatformIcon(platform){
  const symbols={facebook:'f',instagram:'◎',linkedin:'in',tiktok:'♪',x:'X',youtube:'▶'};
  return `<span class="social-platform-icon social-platform-${platform}" aria-hidden="true">${symbols[platform]||'↗'}</span>`;
}
const settingsBeforeSocialDropdown=settingsReal;
settingsReal=function(){
  return settingsBeforeSocialDropdown().replace(
    /<div class="organisation-social-settings"><b>Social media links<\/b>([\s\S]*?)<\/div><\/div>/,
    '<details class="organisation-social-settings"><summary>Social media links</summary><div class="organisation-social-fields">$1</div></details>'
  );
};
const participantDiscoverBeforeSocialIcons=participantDiscoverReal;
participantDiscoverReal=function(){
  return participantDiscoverBeforeSocialIcons().replace(
    /<a class="btn btn-outline btn-small social-profile-link" href="([^"]+)" target="_blank" rel="noopener noreferrer">(Facebook|Instagram|LinkedIn|TikTok|X|YouTube)<\/a>/g,
    (link,url,label)=>{
      const platform=label.toLowerCase()==='linkedin'?'linkedin':label.toLowerCase();
      return `<a class="btn btn-outline btn-small social-profile-link" href="${url}" target="_blank" rel="noopener noreferrer" title="${label}">${socialPlatformIcon(platform)}<span>${label}</span></a>`;
    }
  );
};
window.participantDiscover=participantDiscoverReal;
const editProgrammeDetailsBeforeActivityType=window.editProgrammeDetails;
window.editProgrammeDetails=function(id){
  editProgrammeDetailsBeforeActivityType(id);
  const programme=state.programmes.find(item=>Number(item.id)===Number(id));
  const title=$('#edit-title');
  if(!programme||!title)return;
  if(!$('#edit-activity-type')){
    const field=document.createElement('div');
    field.className='field';
    field.innerHTML='<label for="edit-activity-type">Activity type</label><select id="edit-activity-type" onchange="syncProgrammeTypeFields(\'edit\')"><option value="programme">Ongoing programme</option><option value="activity">Activity</option><option value="event">One-time event</option><option value="campaign">Campaign</option><option value="service">Service</option></select>';
    title.closest('.field')?.before(field);
  }
  const activityType=$('#edit-activity-type');
  activityType.value=programme.activity_type||'programme';
  activityType.onchange=()=>syncProgrammeTypeFields('edit');
  syncProgrammeTypeFields('edit');
  const heading=$('.modal-top h2');
  if(heading)heading.textContent=`Edit ${programme.activity_type||'programme'}`;
  const sessionKind=$('#session-kind');
  const syncSessionKinds=()=>{if(!sessionKind)return;const physicalOnly=$('#edit-format')?.value==='Physical';const selected=sessionKind.value;sessionKind.innerHTML=physicalOnly?'<option value="physical">In person</option>':'<option value="live_online">Live online</option><option value="physical">In person</option>';if(!physicalOnly&&selected)sessionKind.value=selected;};
  syncSessionKinds();
  $('#edit-format')?.addEventListener('change',syncSessionKinds);
};
const openModalBeforeActivityType=window.openModal;
function syncProgrammeTypeFields(prefix){
  const isProgramme=$(`#${prefix}-activity-type`)?.value==='programme';
  const threshold=$(`#${prefix}-threshold`);
  if(threshold){
    const field=threshold.closest('.field');
    if(field){field.hidden=!isProgramme;field.style.display=isProgramme?'':'none';}
    threshold.required=isProgramme;
  }
  const eligibility=$(`#${prefix}-eligibility`);
  if(eligibility){
    eligibility.required=isProgramme;
    const label=eligibility.closest('.field')?.querySelector('label');
    if(label)label.textContent=isProgramme?'Who can take part?':'Who can take part? (optional)';
  }
  if(prefix==='new'){
    const type=$('#new-activity-type')?.value||'programme';
    const label=type==='programme'?'Programme':type.charAt(0).toUpperCase()+type.slice(1);
    const createLabel={activity:'an activity',event:'an event',campaign:'a campaign',service:'a service'}[type]||'a programme';
    const title=`Create ${createLabel}`;
    const heading=$('.modal-top h2');
    if(heading)heading.textContent=title;
    const nameLabel=$('#new-title')?.closest('.field')?.querySelector('label');
    if(nameLabel)nameLabel.textContent=`${label} name`;
    const aboutHeading=$('.programme-builder .programme-form-section h3');
    if(aboutHeading)aboutHeading.textContent=`About this ${type}`;
    const submit=$('.modal form button[type="submit"],.modal form button:not([type])');
    if(submit)submit.textContent=type==='programme'?'Save programme':'Save activity';
  }else if(prefix==='edit'){
    const type=$('#edit-activity-type')?.value||'programme';
    const label=type==='programme'?'Programme':type.charAt(0).toUpperCase()+type.slice(1);
    const heading=$('.modal-top h2');
    if(heading)heading.textContent=`Edit ${type}`;
    const nameLabel=$('#edit-title')?.closest('.field')?.querySelector('label');
    if(nameLabel)nameLabel.textContent=`${label} name`;
    const submit=$('.modal form button[type="submit"],.modal form button:not([type])');
    if(submit)submit.textContent=type==='programme'?'Save programme':'Save activity';
  }
}
window.openModal=function(type){
  const result=openModalBeforeActivityType(type);
  if(type==='new-programme'){
    let activityType=$('#new-activity-type');
    if(!activityType){
      const category=$('#new-category')?.closest('.grid');
      category?.insertAdjacentHTML('afterend','<div class="field"><label for="new-activity-type">Activity type</label><select id="new-activity-type"><option value="programme">Ongoing programme</option><option value="activity">Activity</option><option value="event">One-time event</option><option value="campaign">Campaign</option><option value="service">Service</option></select><small class="row-meta">Activities, events, campaigns, and services do not use class sessions or attendance-certificate thresholds.</small></div>');
      activityType=$('#new-activity-type');
    }
    if(activityType)activityType.onchange=()=>syncProgrammeTypeFields('new');
    syncProgrammeTypeFields('new');
  }
  return result;
};
const manageProgrammeSessionsBeforePhysicalFilter=window.manageProgrammeSessions;
window.manageProgrammeSessions=function(programmeId){
  manageProgrammeSessionsBeforePhysicalFilter(programmeId);
  const programme=state.programmes.find(item=>Number(item.id)===Number(programmeId));
  const sessionKind=$('#session-kind');
  if(sessionKind&&programme?.format?.trim().toLowerCase()==='physical')sessionKind.innerHTML='<option value="physical">In person</option>';
};
icon.Explore=icon.Discover;
icon.Activity=icon.Programmes;

function communityActivityCard(activity){
  const type=activity.activity_type||'programme';
  const title=type==='programme'?'Programme':type.charAt(0).toUpperCase()+type.slice(1);
  const application=(state.applications||[]).find(item=>Number(item.programme_id)===Number(activity.id));
  const joined=application&&['applied','waitlisted','enrolled','completed'].includes(application.status);
  const action=joined?'View your activity':'Explore activity';
  return `<article class="community-activity" data-community-activity="${activity.id}"><div class="community-activity-art">${activity.image_url?`<img data-programme-image="${activity.id}" alt="" loading="lazy">`:`<span>${iconFormat(activity.format)}</span>`}<span class="community-type">${esc(title)}</span></div><div class="community-activity-copy"><span class="eyebrow">${esc(activity.category||title)}</span><h3>${esc(activity.title)}</h3>${activity.description?`<p>${esc(activity.description)}</p>`:''}<div class="row-meta">${esc(activity.organisation_name||'')} · ${dateLabel(activity.start_date)} · ${esc(activity.format||'')}</div><button class="btn btn-outline btn-small" onclick="openParticipantProgramme(${Number(activity.id)})">${action} ${lucideIcon('arrowRight',15)}</button></div></article>`;
}

function communityOrganisationCard(organisation){
  const picture=organisation.image_url?`<img src="${esc(organisation.image_url)}" alt="" loading="lazy">`:`<span>${esc(initials(organisation.name))}</span>`;
  return `<article class="community-organisation"><button class="community-organisation-open" type="button" onclick="openOrganisation(${Number(organisation.id)})"><span class="community-organisation-avatar">${picture}</span><span class="community-organisation-copy"><b>${esc(organisation.name)}</b><small>${esc(organisation.type)}</small>${organisation.description?`<small>${esc(organisation.description)}</small>`:''}</span><span class="community-organisation-arrow" aria-hidden="true">${lucideIcon('arrowRight',17)}</span></button></article>`;
}

participantHomeReal=function(){
  const enrolments=(state.enrolments||[]).filter(item=>['enrolled','completed','applied','waitlisted'].includes(item.status));
  const accessible=enrolments.filter(item=>['enrolled','completed'].includes(item.status));
  const upcoming=accessible.flatMap(item=>(state.sessionsByProgramme?.[item.programme_id]||[]).map(session=>({...session,programme_id:item.programme_id})))
    .filter(session=>new Date(session.scheduled_end)>new Date())
    .sort((left,right)=>new Date(left.scheduled_start)-new Date(right.scheduled_start))[0];
  const activities=(state.programmes||[]).filter(item=>['open','ongoing'].includes(String(item.status).toLowerCase())).slice(0,3);
  const organisations=(state.organisations||[]).slice(0,3);
  const activityContent=activities.length?activities.map(communityActivityCard).join(''):emptyCard('No public activities yet','New activities will appear here when organisations publish them.','<button class="btn btn-outline btn-small" onclick="go(\'Explore\')">Explore Voxera</button>');
  const organisationContent=organisations.length?organisations.map(communityOrganisationCard).join(''):emptyCard('No organisations to explore yet','Public organisation pages will appear here as organisations join Voxera.');
  const nextStep=upcoming?`<article class="community-next-step"><span class="community-next-icon">${lucideIcon('clock',20)}</span><span><small>COMING UP IN YOUR ACTIVITY</small><b>${esc(upcoming.title)}</b><span>${esc(upcoming.programme_title||'')} · ${dateLabel(upcoming.scheduled_start)}</span></span><button class="btn btn-outline btn-small" onclick="go('Activity')">View activity</button></article>`:'';
  const activityIntro=enrolments.length?`${enrolments.length} activity${enrolments.length===1?'':'ies'} in your journey`:'Discover organisations and activities from your community.';
  return `<section class="participant-welcome-hero community-home-hero" style="--participant-welcome-image:url('${stockPhoto('photo-1523240795612-9a054b0db644',1200)}')"><span class="landing-eyebrow">VOXERA · PEOPLE AND POSSIBILITY</span><h1>Welcome, ${esc(currentUser?.name?.split(/\s+/)[0]||'')}</h1><p>${esc(activityIntro)}</p><button class="btn btn-primary" onclick="go('Explore')">Explore organisations and activities ${lucideIcon('arrowRight',16)}</button></section>${nextStep}<section class="community-home-section"><div class="community-section-heading"><div><span class="eyebrow">OUT IN YOUR COMMUNITY</span><h2>Activities to explore</h2><p>Programmes, events, initiatives, and more from real organisations.</p></div><button class="text-link" onclick="go('Explore')">See all ${lucideIcon('arrowRight',15)}</button></div><div class="community-activity-list">${activityContent}</div></section><section class="community-home-section"><div class="community-section-heading"><div><span class="eyebrow">PEOPLE MAKING A DIFFERENCE</span><h2>Organisations on Voxera</h2><p>Meet the groups behind the opportunities.</p></div><button class="text-link" onclick="go('Explore');setDiscoverSection('organisations')">Explore all ${lucideIcon('arrowRight',15)}</button></div><div class="community-organisation-list">${organisationContent}</div></section>${enrolments.length?`<section class="community-home-section"><div class="community-section-heading"><div><span class="eyebrow">YOUR VOXERA ACTIVITY</span><h2>Your activity</h2><p>Applications, upcoming sessions, attendance, and recordings in one place.</p></div><button class="text-link" onclick="go('Activity')">View all ${lucideIcon('arrowRight',15)}</button></div><div class="community-enrolment-list">${enrolments.slice(0,3).map(item=>{const activity=(state.programmes||[]).find(programme=>Number(programme.id)===Number(item.programme_id));return activity?`<button type="button" class="community-enrolment-row" onclick="openParticipantProgramme(${Number(activity.id)})"><span><b>${esc(activity.title)}</b><small>${esc(activity.organisation_name||'')} · ${esc(activity.activity_type||'programme')}</small></span>${enrollmentBadge(item.status)}</button>`:'';}).join('')||emptyCard('Your activity will appear here','Your applications and joined activities will be available here.')}</div></section>`:''}<section class="community-help-strip"><span>${lucideIcon('messagesSquare',20)}</span><div><b>Need a hand?</b><small>Ask Voxera a question or find the team supporting your activity.</small></div><button class="btn btn-outline btn-small" onclick="go('Speak')">Talk to Voxera</button></section>`;
};
window.participantHome=participantHomeReal;

const myProgrammesBeforeCommunityActivity=myProgrammesReal;
myProgrammesReal=function(){
  return myProgrammesBeforeCommunityActivity()
    .replace('YOUR LEARNING JOURNEY','YOUR VOXERA ACTIVITY')
    .replace('My programmes','Your activity')
    .replace('No programmes yet','No activity yet')
    .replace('Apply to a programme to see your sessions, attendance and recordings here.','When you join an activity, its applications, sessions, attendance, and recordings will appear here.')
    .replaceAll('programme team','organisation team');
};
window.myProgrammes=myProgrammesReal;

const participantDiscoverBeforeCommunityLanguage=participantDiscoverReal;
participantDiscoverReal=function(){
  return participantDiscoverBeforeCommunityLanguage()
    .replace('Find programmes or explore the organisations behind them.','Discover organisations and explore their activities, initiatives, and services.')
    .replace('Search programmes, organisations, or areas','Search activities, organisations, or places')
    .replace('All programmes','All activities')
    .replace('>Programmes</button>','>Activities</button>')
    .replace('Active programmes','Current activities')
    .replace('Ended programmes','Activity history')
    .replace('No active programmes','No current activities')
    .replace('No ended programmes','No activity history yet')
    .replace('This organisation has no programmes currently open or ongoing.','This organisation has no current public activities.')
    .replace('This organisation has no ended programmes in its history.','There is no completed activity history to show.')
    .replace('No programmes available yet','No activities available yet')
    .replace('When your organisation publishes an open programme, it will appear here.','New activities from organisations will appear here when they are available.');
};
window.participantDiscover=participantDiscoverReal;

function participant(){
  const currentPage=page;
  const navigation=[['Home','Home'],['Explore','Explore'],['Activity','Activity'],['Messages','Messages'],['Profile','Profile']];
  const view=currentPage==='My Programmes'?'My Programmes':currentPage;
  const active=label=>label==='Activity'?currentPage==='My Programmes':currentPage===label||label==='Explore'&&currentPage==='Discover';
  const content=view==='Home'?participantHomeReal():view==='Discover'?participantDiscoverReal():view==='My Programmes'?myProgrammesReal():view==='Messages'?realParticipantMessages():view==='Profile'?profileReal():view==='Speak'?voicePage():participantHomeReal();
  return `<div class="phone-shell"><div class="phone-top"><a class="brand" href="/" aria-label="Voxera home" onclick="event.preventDefault();go('Home')"><span class="brandmark">v</span> voxera</a><button type="button" class="avatar participant-self-avatar" aria-label="Open your profile" onclick="go('Profile')">${esc(initials(currentUser?.name||''))}</button></div><div class="phone-content">${content}</div><nav class="phone-nav" aria-label="Participant navigation">${navigation.map(([label,key])=>`<button type="button" class="${active(label)?'active':''}" aria-current="${active(label)?'page':'false'}" aria-label="${label}" onclick="go('${label}')"><span class="nav-icon">${icon[key]||icon.Home}</span><span class="phone-nav-label">${label}</span></button>`).join('')}</nav></div>`;
}
window.participant=participant;

function mobileMore(){
  const tools=[['Gallery','Gallery'],['Follow-Up','Follow-Up'],['Reports','Reports'],['My organisation','My organisation']];
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-back mobile-menu-back" onclick="if(event.target===this)closeModal()"><div class="modal mobile-menu"><div class="modal-top"><div><span class="eyebrow">ORGANISATION WORKSPACE</span><h2>More tools</h2><p>Manage your public presence and other workspaces.</p></div><button class="close" onclick="closeModal()" aria-label="Close">×</button></div>${tools.map(([label,target])=>`<button type="button" class="nav-item" onclick="closeModal();go('${target}')"><span class="nav-icon">${label==='My organisation'?icon.Settings:label==='Follow-Up'?lucideIcon('heartHandshake',18):icon[label]||lucideIcon('sparkles',18)}</span>${label}</button>`).join('')}</div></div>`);
}
window.mobileMore=mobileMore;

const realLayoutBeforeCommunityArchitecture=realLayout;
realLayout=function(content){
  if(role==='admin'||role==='participant')return realLayoutBeforeCommunityArchitecture(content);
  if(page==='Messages'||(page==='Follow-Up'&&messageView==='conversation'))return realLayoutBeforeCommunityArchitecture(content);
  const routes=[
    ['Overview','Dashboard',icon.Dashboard],
    ['My organisation','My organisation',icon.Settings],
    ['Activities','Activities',icon.Programmes],
    ['Participants','Participants',icon.Participants],
    ['Messages','Messages',icon.Messages]
  ];
  const isActive=(label,target)=>page===target||label==='Activities'&&(page==='Programme Classes'||page==='Programmes')||label==='My organisation'&&page==='Settings';
  const desktop=routes.map(([label,target,svg])=>`<button type="button" class="nav-item ${isActive(label,target)?'active':''}" ${target==='Messages'?'data-message-nav':''} onclick="go('${target}')"><span class="nav-icon">${svg}${target==='Messages'?unreadBadge():''}</span>${label}</button>`).join('');
  const mobileRoutes=routes.filter(([,target])=>['Dashboard','Activities','Participants','Messages'].includes(target));
  const mobile=mobileRoutes.map(([label,target,svg])=>`<button type="button" class="mobile-nav-item ${isActive(label,target)?'active':''}" ${target==='Messages'?'data-message-nav':''} onclick="go('${target}')"><span class="mobile-nav-icon">${svg}${target==='Messages'?unreadBadge():''}</span><small>${label==='Messages'?'Inbox':label}</small></button>`).join('');
  return `${realTopbar()}<div class="layout organisation-workspace-layout"><aside class="sidebar"><div class="side-label">Your organisation</div>${desktop}<div class="organisation-sidebar-more"><button type="button" class="nav-item" onclick="mobileMore()"><span class="nav-icon">${lucideIcon('sparkles',18)}</span>More tools</button></div><div class="side-bottom"><button class="nav-item" onclick="showGuide(false)"><span class="nav-icon">${lucideIcon('circleHelp',18)}</span>Help & guide</button><div class="notice" style="margin:10px 4px 0">Your organisation’s records are private to this workspace.</div></div></aside><main class="content">${content}</main></div><nav class="mobile-organiser-nav community-org-mobile-nav" aria-label="Organisation navigation">${mobile}<button type="button" class="mobile-nav-item" onclick="mobileMore()"><span>${lucideIcon('sparkles',19)}</span><small>More</small></button></nav>`;
};

const goBeforeCommunityDestinations=window.go;
window.go=function(next){
  if(next==='Explore')next='Discover';
  else if(next==='Activity')next='My Programmes';
  else if(next==='Activities')next='Programmes';
  else if(next==='My organisation')next='Settings';
  return goBeforeCommunityDestinations(next);
};

const settingsBeforeCommunityPresence=settingsReal;
settingsReal=function(){
  return settingsBeforeCommunityPresence()
    .replace('<div class="eyebrow">YOUR WORKSPACE</div><h1 class="page-title">Settings</h1><p class="page-subtitle">Edit your personal profile, organisation details, follow-up rules, and appearance.</p>','<div class="eyebrow">YOUR ORGANISATION</div><h1 class="page-title">My organisation</h1><p class="page-subtitle">Manage your public presence, account, and organisation preferences.</p>')
    .replace('<h2 class="card-title">Organisation profile</h2></div>','<h2 class="card-title">Organisation profile</h2><button type="button" class="btn btn-outline btn-small" onclick="go(\'Gallery\')">Open gallery</button></div>');
};
window.settings=settingsReal;

const programmesBeforeCommunityLanguage=programmesWithReview;
programmesWithReview=function(){
  return programmesBeforeCommunityLanguage()
    .replace('PROGRAMME MANAGEMENT','ACTIVITY MANAGEMENT')
    .replace('Programmes','Activities')
    .replace('Create programmes and review applications. Add sessions separately from each programme card.','Create programmes, events, campaigns, and services. Manage applications and activity details here.');
};
window.programmes=programmesWithReview;

const publicOrganisationPageBeforeSignedInActions=guestOrganisationPage;
guestOrganisationPage=function(){
  let markup=publicOrganisationPageBeforeSignedInActions();
  const organisation=state.publicOrganisation?.organisation;
  if(!organisation)return markup;
  markup=markup.replace('<p>This organisation has not added a description yet.</p>','').replace('<p class="page-subtitle"></p>','');
  if(!authToken)return markup;
  if(role==='participant'){
    markup=markup.replace(/<button class="btn btn-primary" onclick="openAuthChoice\('signup'\)">Connect with this organisation <span aria-hidden="true">↗<\/span><\/button>/,`<button class="btn btn-primary" onclick="openOrganisation(${Number(organisation.id)})">Explore this organisation in Voxera ${lucideIcon('arrowRight',16)}</button>`)
      .replace('<button class="btn btn-outline btn-small" onclick="openAuthChoice(\'login\')">Log in</button>','<button class="btn btn-outline btn-small" onclick="closeGuestOrganisation();go(\'Explore\')">Explore Voxera</button>')
      .replace('<button class="btn btn-primary btn-small" onclick="openAuthChoice(\'signup\')">Sign up</button>','<button class="btn btn-primary btn-small" onclick="openOrganisation('+Number(organisation.id)+')">Open organisation</button>');
    for(const activity of state.publicOrganisation.activities||[]){
      markup=markup.replace('<button class="btn btn-primary btn-small" onclick="openAuthChoice(\'signup\')">Sign up to apply</button>',`<button class="btn btn-primary btn-small" onclick="apply(${Number(activity.id)})">Join activity</button>`);
    }
  }else{
    markup=markup.replace(/<button class="btn btn-primary btn-small" onclick="openAuthChoice\('signup'\)">Sign up to apply<\/button>/g,'');
    markup=markup.replace(/<button class="btn btn-primary" onclick="openAuthChoice\('signup'\)">Connect with this organisation <span aria-hidden="true">↗<\/span><\/button>/,'');
    markup=markup.replace('<button class="btn btn-outline btn-small" onclick="openAuthChoice(\'login\')">Log in</button>','');
    markup=markup.replace('<button class="btn btn-primary btn-small" onclick="openAuthChoice(\'signup\')">Sign up</button>','');
  }
  return markup;
};

const dashboardBeforeCommunityOverview=dashboardReal;
dashboardReal=function(){
  const settings=state.settings||{};
  const active=(state.programmes||[]).filter(item=>['open','ongoing'].includes(String(item.status).toLowerCase()));
  const pending=(state.applications||[]).filter(item=>item.status==='applied');
  const activities=active.slice(0,4);
  const activityRows=activities.length?activities.map(activity=>`<article class="community-org-activity-row"><span class="community-org-activity-mark">${iconFormat(activity.format)}</span><span class="community-org-activity-copy"><small>${esc(activity.activity_type==='programme'?'Programme':activity.activity_type||'Activity')} · ${esc(activity.category||'')}</small><b>${esc(activity.title)}</b><small>${dateLabel(activity.start_date)} · ${esc(activity.location||'')}</small></span><span class="community-org-activity-actions"><button type="button" class="btn btn-outline btn-small" onclick="editProgrammeDetails(${Number(activity.id)})">Edit</button>${usesProgrammeClasses(activity)?`<button type="button" class="btn btn-outline btn-small" onclick="manageProgrammeSessions(${Number(activity.id)})">Sessions</button>`:''}</span></article>`).join(''):`<div class="community-org-empty"><span class="eyebrow">START WITH ONE ACTIVITY</span><h2>Bring your work to Voxera.</h2><p>Create a programme, event, campaign, activity, or service. Choose only the workflow that fits what you do.</p><button class="btn btn-primary" onclick="openModal('new-programme')">Create an activity ${lucideIcon('arrowRight',16)}</button></div>`;
  const preview=settings.slug&&settings.public_page_available?`<a class="btn btn-outline btn-small" href="/organisations/${encodeURIComponent(settings.slug)}" target="_blank" rel="noopener noreferrer">Preview public page ${lucideIcon('arrowRight',15)}</a>`:'';
  return `<section class="community-org-overview-hero"><div><span class="landing-eyebrow">VOXERA · YOUR ORGANISATION</span><h1>${esc(settings.name||currentUser?.name||'Your organisation')}</h1><p>${settings.description?esc(settings.description):'Build your public presence, share activities, and connect with your community.'}</p><div class="community-org-quick-actions"><button class="btn btn-primary" onclick="go('Activities')">Manage activities ${lucideIcon('arrowRight',16)}</button><button class="btn btn-outline" onclick="go('My organisation')">Edit organisation</button><button class="btn btn-outline" onclick="go('Gallery')">Open gallery</button>${preview}</div></div></section><section class="community-org-summary" aria-label="Organisation overview"><div><b>${active.length}</b><span>published activities</span></div><div><b>${(state.people||[]).length}</b><span>participants in your workspace</span></div><button type="button" onclick="go('Activities')"><b>${pending.length}</b><span>applications to review</span></button></section><section class="community-home-section community-org-activities"><div class="community-section-heading"><div><span class="eyebrow">YOUR COMMUNITY · WHAT'S HAPPENING</span><h2>Current activities</h2><p>Manage published opportunities across your organisation.</p></div><button type="button" class="text-link" onclick="go('Activities')">View all ${lucideIcon('arrowRight',15)}</button></div>${activityRows}</section>${pending.length?`<section class="community-home-section community-org-pending"><div class="community-section-heading"><div><span class="eyebrow">NEEDS YOUR ATTENTION</span><h2>Applications to review</h2><p>${pending.length} application${pending.length===1?'':'s'} waiting for your team.</p></div><button class="btn btn-outline btn-small" onclick="go('Activities')">Review applications</button></div></section>`:''}`;
};
window.dashboard=dashboardReal;
