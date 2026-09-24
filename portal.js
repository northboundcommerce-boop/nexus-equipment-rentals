const db=window.nexusDb,$=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
let adminCustomers=[],adminRentals=[],adminEquipment=[];
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>v==null||v===''?'—':'$'+Number(v).toFixed(2);

async function syncMyProfileFromAuth(){
 const {data:{user}}=await db.auth.getUser();
 if(!user)return;
 const {data:p}=await db.from('profiles').select('*').eq('id',user.id).maybeSingle();
 const meta=user.user_metadata||{};
 const patch={};
 if(!p?.full_name && meta.full_name)patch.full_name=meta.full_name;
 if(!p?.phone && meta.phone)patch.phone=meta.phone;
 if(!p?.business_name && meta.business_name)patch.business_name=meta.business_name;
 if((!p?.account_type||p.account_type==='individual') && meta.account_type)patch.account_type=meta.account_type;
 if(Object.keys(patch).length)await db.from('profiles').update(patch).eq('id',user.id);
}

function msg(t){$('#portalMsg').textContent=t;$('#portalMsg').classList.remove('hidden');setTimeout(()=>$('#portalMsg').classList.add('hidden'),5000)}
async function signout(){await db.auth.signOut();location.reload()} $$('[data-signout]').forEach(b=>b.onclick=signout);


// ===== LOGIN HELP / PASSWORD RESET =====
function installLoginHelp(){
 const loginForm=document.getElementById('loginForm');if(!loginForm||document.getElementById('forgotPasswordBtn'))return;
 const password=document.getElementById('loginPassword');
 const anchor=password?.closest('label')||password;
 const help=document.createElement('div');help.className='login-help-row';
 help.innerHTML=`<button type="button" id="forgotPasswordBtn" class="auth-help-link">Forgot password?</button><button type="button" id="loginHelpBtn" class="auth-help-link">Login help</button>`;
 anchor?.insertAdjacentElement('afterend',help);
 document.getElementById('forgotPasswordBtn').onclick=openForgotPassword;
 document.getElementById('loginHelpBtn').onclick=openLoginHelp;
}
function authHelpModal(html){
 document.getElementById('authHelpModal')?.remove();
 const m=document.createElement('div');m.id='authHelpModal';m.className='auth-help-overlay';m.innerHTML=`<div class="auth-help-card"><button class="auth-help-close" type="button">×</button>${html}</div>`;
 document.body.appendChild(m);m.querySelector('.auth-help-close').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};return m;
}
window.openForgotPassword=()=>{
 const current=document.getElementById('loginEmail')?.value?.trim()||'';
 const m=authHelpModal(`<span class="auth-help-kicker">NEXUS ACCOUNT RECOVERY</span><h2>Reset your password</h2><p>Enter the email address connected to your Nexus account. We'll send you a secure password reset link.</p><label>Email address<input id="resetEmail" type="email" autocomplete="email" value="${esc(current)}" placeholder="you@example.com"></label><button id="sendResetBtn" class="auth-help-primary">Send Password Reset Link</button><small class="auth-help-note">For security, Nexus staff will never ask for your password.</small>`);
 m.querySelector('#sendResetBtn').onclick=async()=>{
  const email=m.querySelector('#resetEmail').value.trim();if(!email)return msg('Enter your account email.');
  const btn=m.querySelector('#sendResetBtn');btn.disabled=true;btn.textContent='Sending…';
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/portal.html?reset_password=1`});
  if(error){btn.disabled=false;btn.textContent='Send Password Reset Link';return msg(error.message)}
  m.innerHTML=`<div class="auth-help-success"><div>✓</div><h2>Check your email</h2><p>If an account exists for <b>${esc(email)}</b>, use the reset link in the email to choose a new password.</p><button class="auth-help-primary" onclick="document.getElementById('authHelpModal')?.remove()">Back to Login</button></div>`;
 };
};
window.openLoginHelp=()=>authHelpModal(`<span class="auth-help-kicker">NEXUS LOGIN HELP</span><h2>Having trouble signing in?</h2><div class="login-help-options"><button type="button" onclick="document.getElementById('authHelpModal')?.remove();openForgotPassword()"><b>Forgot your password?</b><span>Send a secure password reset email.</span></button><div><b>Didn't confirm your email?</b><span>Check your inbox and spam folder for the confirmation message sent when you created your account.</span></div><div><b>Wrong email?</b><span>Use the same email address you used when creating your Nexus rental account.</span></div></div><small class="auth-help-note">If you still cannot access your account, contact Nexus Equipment Rentals for account assistance.</small>`);
async function showNewPasswordModal(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const query=new URLSearchParams(location.search);
 if(!(query.get('reset_password')==='1'||hash.get('type')==='recovery'))return;
 const {data:{session}}=await db.auth.getSession();if(!session)return;
 const m=authHelpModal(`<span class="auth-help-kicker">NEXUS ACCOUNT RECOVERY</span><h2>Choose a new password</h2><p>Create a new password for your Nexus account.</p><label>New password<input id="newPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label><label>Confirm password<input id="confirmPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Enter it again"></label><button id="updatePasswordBtn" class="auth-help-primary">Update Password</button>`);
 m.querySelector('#updatePasswordBtn').onclick=async()=>{
  const a=m.querySelector('#newPassword').value,b=m.querySelector('#confirmPassword').value;if(a.length<8)return msg('Password must be at least 8 characters.');if(a!==b)return msg('Passwords do not match.');
  const btn=m.querySelector('#updatePasswordBtn');btn.disabled=true;btn.textContent='Updating…';const {error}=await db.auth.updateUser({password:a});if(error){btn.disabled=false;btn.textContent='Update Password';return msg(error.message)}
  history.replaceState({},'',location.pathname);m.remove();msg('Password updated successfully.');
 };
}
document.addEventListener('DOMContentLoaded',()=>{installLoginHelp();showNewPasswordModal()});
setTimeout(()=>{installLoginHelp();showNewPasswordModal()},250);
(function(){const st=document.createElement('style');st.textContent=`.login-help-row{display:flex;justify-content:space-between;gap:12px;margin:-3px 0 13px}.auth-help-link{border:0;background:none;color:#b9b9c0;padding:0;font-size:12px;cursor:pointer}.auth-help-link:hover{color:#ff3b45}.auth-help-overlay{position:fixed;inset:0;z-index:99999;background:#000c;display:grid;place-items:center;padding:18px}.auth-help-card{position:relative;width:min(480px,94vw);background:#0c0c0f;border:1px solid #34343b;border-radius:13px;padding:28px;color:#fff;box-shadow:0 30px 80px #000}.auth-help-close{position:absolute;right:15px;top:12px;border:0;background:none;color:#aaa;font-size:28px;cursor:pointer}.auth-help-kicker{color:#ef202c;font-size:10px;font-weight:900;letter-spacing:.15em}.auth-help-card h2{font-size:27px;margin:7px 0 8px}.auth-help-card p{color:#aaa;line-height:1.5}.auth-help-card label{display:block;margin:17px 0;font-weight:800;font-size:12px}.auth-help-card input{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px;background:#070709;border:1px solid #36363d;border-radius:7px;color:#fff}.auth-help-primary{width:100%;padding:13px;border:0;border-radius:7px;background:#e91f2c;color:#fff;font-weight:900;cursor:pointer}.auth-help-primary:disabled{opacity:.6}.auth-help-note{display:block;color:#777;margin-top:14px;line-height:1.5}.login-help-options{display:grid;gap:10px;margin:18px 0}.login-help-options>button,.login-help-options>div{display:block;width:100%;box-sizing:border-box;text-align:left;padding:14px;border:1px solid #303038;border-radius:8px;background:#09090c;color:#fff}.login-help-options>button{cursor:pointer}.login-help-options>button:hover{border-color:#e91f2c}.login-help-options b,.login-help-options span{display:block}.login-help-options span{color:#888;font-size:11px;margin-top:4px}.auth-help-success{text-align:center}.auth-help-success>div{width:48px;height:48px;margin:auto;border-radius:50%;display:grid;place-items:center;background:#176b36;font-size:22px}`;document.head.appendChild(st)})();

$('#loginForm').onsubmit=async e=>{e.preventDefault();const {error}=await db.auth.signInWithPassword({email:$('#loginEmail').value,password:$('#loginPassword').value});if(error)return msg(error.message);boot()};
$('#signupForm').onsubmit=async e=>{
 e.preventDefault();
 const email=$('#signupEmail').value.trim();
 const password=$('#signupPassword').value;
 const full_name=$('#signupName').value.trim();
 const phone=$('#signupPhone').value.trim();
 const account_type=$('#signupType').value;
 const business_name=$('#signupBusiness').value.trim()||null;

 const {data,error}=await db.auth.signUp({
   email,
   password,
   options:{
     data:{
       full_name,
       phone,
       account_type,
       business_name
     }
   }
 });

 if(error){
   if(String(error.message).toLowerCase().includes('rate limit')){
     return msg('Too many confirmation emails have been requested. Please wait and try again later.');
   }
   return msg(error.message);
 }

 // The database trigger now creates public.profiles automatically.
 // Do NOT manually insert/upsert a profile here.
 msg(data.session
   ? 'Account created. Your Nexus client profile is pending approval.'
   : 'Account created. Check your email to confirm your address, then sign in. Your profile will be pending Nexus approval.'
 );
 e.target.reset();
};
async function isAdmin(){const {data}=await db.rpc('is_admin');return !!data}

$$('.admin-tab').forEach(b=>b.onclick=()=>{ $$('.admin-tab').forEach(x=>x.classList.remove('active')); $$('.admin-panel').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('#tab-'+b.dataset.tab).classList.add('active') });

async function loadCustomer(){
 const {data:{user}}=await db.auth.getUser();
 await syncMyProfileFromAuth();
 const {data:p}=await db.from('profiles').select('*').eq('id',user.id).maybeSingle();
 const status=p?.approval_status||'pending';
 $('#customerStatus').textContent=status;
 $('#profileInfo').innerHTML=`<div class="customer-account-card">
   <div class="customer-avatar">${esc((p?.full_name||user.email||'N').charAt(0).toUpperCase())}</div>
   <div><b>${esc(p?.full_name||user.email)}</b><span>${esc(p?.business_name||'Individual account')}</span><small>${esc(user.email)}</small>${p?.phone?`<small>${esc(p.phone)}</small>`:''}</div>
 </div>`;

 renderCustomerApprovalTracker(status);
 renderCustomerAdminMessage(p);
 await loadCustomerChat(user.id);
 await loadMyPaymentRequests();
 await loadVerification();

 await loadCustomerEquipment(status==='approved');
 const {data:r,error}=await db.from('rental_requests').select('id,start_date,end_date,status,equipment(name)').eq('customer_id',user.id).order('created_at',{ascending:false});
 if(error){msg(error.message);return}
 const {data:signedRows,error:signedErr}=await db.from('rental_contracts').select('rental_request_id').eq('customer_id',user.id);
 if(signedErr) console.error('Could not load signed contracts:',signedErr);
 const signedRentalIds=new Set((signedRows||[]).map(c=>String(c.rental_request_id)));
 (r||[]).forEach(x=>x._hasSignedContract=signedRentalIds.has(String(x.id)));
 $('#myRentals').innerHTML=r?.length?r.map(x=>{
   if(x._hasSignedContract && ['approved','contract_required'].includes(x.status)) x.status='confirmed';
   const cancellable=['pending','approved','contract_required','confirmed'].includes(x.status);
   const action=['approved','contract_required'].includes(x.status) && !x._hasSignedContract
     ? `<button class="small-btn red contract-sign-btn" onclick="openRentalContract('${x.id}')">Review & Sign Contract</button>`
     : ['confirmed','active','completed'].includes(x.status)
       ? `<div class="customer-signed-contract-actions"><small class="contract-signed-note">✓ Contract signed</small><button class="small-btn" onclick="viewMySignedContract('${x.id}')">View Contract</button><button class="small-btn" onclick="downloadMySignedContract('${x.id}')">Download Copy</button></div>`:'';
   return `<div class="notice client-rental-row">
     <div class="client-rental-info">
       <b>${esc(x.equipment?.name||'Equipment')}</b>
       <span class="client-rental-dates">${esc(x.start_date||'')} → ${esc(x.end_date||'')}</span>
       <span class="status">${esc((x.status||'pending').replaceAll('_',' '))}</span>
       ${action}
       ${cancellable?`<button class="cancel-reservation-btn" onclick="openCancelReservation('${x.id}','${esc(x.equipment?.name||'Equipment')}','${esc(x.start_date||'')}','${esc(x.end_date||'')}')">Cancel Reservation</button>`:`${x.status==='active'?'<small class="contact-nexus-note">Equipment is active. Contact Nexus if you need assistance.</small>':''}`}
     </div>
   </div>`;
 }).join(''):'<div class="customer-empty-state">No rental requests yet.</div>';
}


function renderCustomerAdminMessage(profile){
 let mount=document.getElementById('customerAdminMessage');if(!mount){mount=document.createElement('div');mount.id='customerAdminMessage';const tracker=document.getElementById('customerApprovalTracker');if(tracker)tracker.insertAdjacentElement('afterend',mount);else document.getElementById('profileInfo')?.insertAdjacentElement('afterend',mount)}
 const more=profile?.approval_status==='more_info'&&profile?.more_info_request;const text=more?profile.more_info_request:profile?.admin_message;
 if(!text){mount.innerHTML='';return}
 mount.innerHTML=`<div class="customer-admin-message ${more?'attention':''}"><span>${more?'MORE INFORMATION NEEDED':'MESSAGE FROM NEXUS'}</span><p>${esc(text)}</p></div>`;
}

function renderCustomerApprovalTracker(status){
 let mount=document.getElementById('customerApprovalTracker');
 if(!mount){
   mount=document.createElement('div');
   mount.id='customerApprovalTracker';
   const info=document.getElementById('profileInfo');
   if(info)info.insertAdjacentElement('afterend',mount); else return;
 }
 const normalized=status||'pending';
 const steps=[
   {key:'submitted',label:'Account Submitted'},
   {key:'review',label:'Nexus Review'},
   {key:'decision',label:normalized==='rejected'?'Rejected':normalized==='more_info'?'More Info Needed':'Approved'}
 ];
 let active= normalized==='approved'?3 : ['rejected','more_info'].includes(normalized)?3 : 2;
 mount.innerHTML=`<div class="approval-tracker ${esc(normalized)}">
   <div class="approval-tracker-head">
    <div><span class="tracker-kicker">ACCOUNT APPROVAL</span><h3>${normalized==='approved'?'Your account is approved':normalized==='rejected'?'Application not approved':normalized==='more_info'?'More information is needed':'Your account is being reviewed'}</h3></div>
    <span class="tracker-status">${esc(normalized.replaceAll('_',' ').toUpperCase())}</span>
   </div>
   <div class="tracker-line">
    ${steps.map((s,i)=>`<div class="tracker-step ${i+1<=active?'done':''} ${i===2&&normalized==='rejected'?'rejected':''} ${i===2&&normalized==='more_info'?'attention':''}">
      <span class="tracker-dot">${i+1}</span><b>${esc(s.label)}</b>
    </div>`).join('')}
   </div>
   <p class="tracker-copy">${normalized==='approved'?'You can request available equipment and manage your rentals below.':normalized==='rejected'?'Your account was not approved. Contact Nexus if you believe additional information should be reviewed.':normalized==='more_info'?'Nexus needs additional information before your account can be approved. Review the verification section below.':'Nexus is reviewing your account. You can track the decision here.'}</p>
 </div>`;
}

window.openCancelReservation=(id,name,start,end)=>{
 let modal=document.getElementById('cancelReservationModal');
 if(!modal){modal=document.createElement('div');modal.id='cancelReservationModal';document.body.appendChild(modal)}
 modal.className='cancel-reservation-modal';
 modal.innerHTML=`<div class="cancel-reservation-card">
   <button class="cancel-modal-close" onclick="document.getElementById('cancelReservationModal').remove()">×</button>
   <p class="nexus-kicker">NEXUS EQUIPMENT RENTALS</p>
   <h2>Cancel Reservation?</h2>
   <p class="muted">Please confirm that you want to cancel this reservation.</p>
   <div class="cancel-summary">
     <div><span>Equipment</span><b>${esc(name)}</b></div>
     <div><span>Dates</span><b>${esc(start)} → ${esc(end)}</b></div>
   </div>
   <label>Reason for cancellation <span class="optional">(optional)</span>
     <textarea id="cancelReservationReason" rows="4" placeholder="Tell Nexus why you're cancelling..."></textarea>
   </label>
   <div class="cancel-modal-actions">
     <button class="cancel-confirm-btn" onclick="confirmCancelReservation('${id}')">Yes, Cancel Reservation</button>
     <button class="cancel-keep-btn" onclick="document.getElementById('cancelReservationModal').remove()">Keep Reservation</button>
   </div>
 </div>`;
};

window.confirmCancelReservation=async id=>{
 const reason=$('#cancelReservationReason')?.value.trim()||null;
 const {data:{user}}=await db.auth.getUser();
 const {data:r,error:readError}=await db.from('rental_requests').select('id,status,customer_id,customer_notes').eq('id',id).eq('customer_id',user.id).maybeSingle();
 if(readError)return msg(readError.message);
 if(!r)return msg('Reservation not found.');
 if(!['pending','approved','contract_required','confirmed'].includes(r.status))return msg('This reservation can no longer be cancelled online. Please contact Nexus.');
 const existing=(r.customer_notes||'').trim();
 const cancellationNote=reason?`Cancellation reason: ${reason}`:'Cancelled by customer';
 const {error}=await db.from('rental_requests').update({
   status:'cancelled',
   customer_notes:[existing,cancellationNote].filter(Boolean).join('\n')
 }).eq('id',id).eq('customer_id',user.id);
 if(error)return msg(error.message);
 document.getElementById('cancelReservationModal')?.remove();
 msg('Your reservation has been cancelled. The dates are available again.');
 await loadCustomer();
};


async function loadVerification(){
 const panel=document.getElementById('verificationPanel');
 if(!panel)return;
 try{
  const {data:{user},error:ue}=await db.auth.getUser();
  if(ue||!user)throw new Error(ue?.message||'Please sign in again.');
  const {data:v,error}=await db.from('customer_verifications').select('*').eq('user_id',user.id).maybeSingle();
  if(error)throw error;
  const status=v?.status||'not_submitted';
  const label={
   not_submitted:'NOT SUBMITTED',
   under_review:'UNDER REVIEW',
   verified:'VERIFIED',
   needs_attention:'MORE INFO NEEDED',
   rejected:'REJECTED'
  }[status]||status.toUpperCase();

  panel.innerHTML=`<div class="verification-head">
    <div><span class="verification-kicker">REQUIRED BEFORE RENTAL APPROVAL</span><h2>Identity Verification</h2></div>
    <span class="verification-badge ${esc(status)}">${esc(label)}</span>
   </div>
   ${v?.admin_notes&&['needs_attention','rejected'].includes(status)?`<div class="verification-admin-note"><b>Message from Nexus</b><p>${esc(v.admin_notes)}</p></div>`:''}
   ${status==='verified'?`<div class="verification-success"><b>✓ Identity verified</b><p>Your identity verification is complete. Nexus can now use this as part of the rental approval process.</p></div>`:`
   <form id="verificationForm" class="verification-form">
    <div class="verification-grid">
     <label>Legal First Name<input id="vfFirst" required value="${esc(v?.legal_first_name||'')}"></label>
     <label>Legal Last Name<input id="vfLast" required value="${esc(v?.legal_last_name||'')}"></label>
     <label class="full">Street Address<input id="vfAddress" required value="${esc(v?.address_line1||'')}"></label>
     <label>City<input id="vfCity" required value="${esc(v?.city||'')}"></label>
     <label>State<input id="vfState" maxlength="2" required value="${esc(v?.state||'')}"></label>
     <label>ZIP Code<input id="vfZip" required value="${esc(v?.postal_code||'')}"></label>
     <label>Driver License Number<input id="vfLicense" required value="${esc(v?.license_number||'')}"></label>
     <label>License State<input id="vfLicenseState" maxlength="2" required value="${esc(v?.license_state||'')}"></label>
     <label>License Expiration<input id="vfExpiration" type="date" required value="${esc(v?.license_expiration||'')}"></label>
     <label>Tax ID Type<select id="vfTaxType"><option value="ssn" ${v?.tax_id_type==='ssn'?'selected':''}>SSN</option><option value="ein" ${v?.tax_id_type==='ein'?'selected':''}>EIN</option></select></label>
     <label>SSN / EIN ${v?.tax_id_last4?`<small>Current ending: •••• ${esc(v.tax_id_last4)}</small>`:''}<input id="vfTaxId" inputmode="numeric" placeholder="${v?.tax_id_last4?'Enter only if changing':'Enter SSN or EIN'}" ${v?.tax_id_last4?'':'required'}></label>
     <label>License Front ${v?.license_front_path?'<small>✓ File already uploaded</small>':''}<input id="vfFront" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ${v?.license_front_path?'':'required'}></label>
     <label>License Back ${v?.license_back_path?'<small>✓ File already uploaded</small>':''}<input id="vfBack" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ${v?.license_back_path?'':'required'}></label>
    </div>
    <label class="verification-consent"><input id="vfConsent" type="checkbox" required> I certify that this information is accurate and authorize Nexus Equipment Rentals to review it for account and rental approval.</label>
    <p class="verification-privacy">For security, Nexus stores only the last four digits of the SSN/EIN entered here.</p>
    <button class="verification-submit" type="submit">${v?'Update & Resubmit Verification':'Submit Verification'}</button>
   </form>`}`;
  document.getElementById('verificationForm')?.addEventListener('submit',e=>submitVerification(e,v));
 }catch(err){
  panel.innerHTML=`<div class="verification-head"><div><span class="verification-kicker">REQUIRED BEFORE RENTAL APPROVAL</span><h2>Identity Verification</h2></div><span class="verification-badge rejected">ERROR</span></div><div class="verification-admin-note"><b>Verification form could not load</b><p>${esc(err.message||String(err))}</p></div>`;
 }
}

async function submitVerification(e,existing){
 e.preventDefault();
 const btn=e.currentTarget.querySelector('button[type="submit"]');
 btn.disabled=true;btn.textContent='Submitting...';
 try{
  const {data:{user}}=await db.auth.getUser();
  const front=document.getElementById('vfFront')?.files?.[0];
  const back=document.getElementById('vfBack')?.files?.[0];
  let frontPath=existing?.license_front_path||null, backPath=existing?.license_back_path||null;

  const upload=async(file,side)=>{
   if(!file)return null;
   if(file.size>8*1024*1024)throw new Error(`${side} file must be 8 MB or smaller.`);
   const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
   const path=`${user.id}/${side}-${Date.now()}.${ext}`;
   const {error}=await db.storage.from('customer-verification-documents').upload(path,file,{upsert:false});
   if(error)throw error;
   return path;
  };
  if(front)frontPath=await upload(front,'license-front');
  if(back)backPath=await upload(back,'license-back');

  const rawTax=(document.getElementById('vfTaxId')?.value||'').replace(/\D/g,'');
  if(!existing?.tax_id_last4 && rawTax.length<4)throw new Error('Enter a valid SSN or EIN.');
  const payload={
   user_id:user.id,
   legal_first_name:document.getElementById('vfFirst').value.trim(),
   legal_last_name:document.getElementById('vfLast').value.trim(),
   address_line1:document.getElementById('vfAddress').value.trim(),
   city:document.getElementById('vfCity').value.trim(),
   state:document.getElementById('vfState').value.trim().toUpperCase(),
   postal_code:document.getElementById('vfZip').value.trim(),
   license_number:document.getElementById('vfLicense').value.trim(),
   license_state:document.getElementById('vfLicenseState').value.trim().toUpperCase(),
   license_expiration:document.getElementById('vfExpiration').value,
   tax_id_type:document.getElementById('vfTaxType').value,
   tax_id_last4:rawTax?rawTax.slice(-4):existing?.tax_id_last4,
   license_front_path:frontPath,
   license_back_path:backPath,
   status:'under_review',
   submitted_at:new Date().toISOString()
  };
  const {error}=await db.from('customer_verifications').upsert(payload,{onConflict:'user_id'});
  if(error)throw error;
  msg('Verification submitted to Nexus for review.');
  await loadVerification();
 }catch(err){msg(err.message||String(err));btn.disabled=false;btn.textContent='Submit Verification'}
}

async function loadCustomerEquipment(approved){
 const {data,error}=await db.from('equipment').select('*').neq('status','inactive').order('created_at',{ascending:false});
 if(error){$('#customerEquipment').innerHTML=`<div class="equipment-item">${esc(error.message)}</div>`;return}
 const equipment=data||[];
 const ids=equipment.map(x=>x.id);
 let imageRows=[];
 if(ids.length){
   const {data:imgs,error:imgErr}=await db.from('equipment_images').select('*').in('equipment_id',ids).order('sort_order',{ascending:true});
   if(!imgErr)imageRows=imgs||[];
 }
 equipment.forEach(x=>{
   x.gallery=imageRows.filter(i=>i.equipment_id===x.id);
   const cover=x.gallery.find(i=>i.is_cover)||x.gallery[0];
   if(cover?.public_url)x.image_url=cover.public_url;
   x._approved=approved;
 });
 window.customerEquipmentCatalog=equipment;
 renderCustomerEquipmentCatalog(equipment,approved);
}
function eqCard(x,admin=false,approved=false){
 if(admin){
  return `<div class="equipment-item">${x.image_url?`<img src="${esc(x.image_url)}" alt="${esc(x.name)}" class="eq-img">`:''}<span class="status">${esc(x.status)}</span><h3>${esc(x.name)}</h3><p class="muted">${esc(x.category||'Equipment')}</p><p>${esc(x.description||'')}</p><div class="rate-row"><b>${money(x.daily_rate)}/day</b><span>${money(x.weekly_rate)}/week</span></div><div class="admin-actions"><button class="small-btn" onclick="editEq('${x.id}')">Edit</button><button class="small-btn" onclick="setEq('${x.id}','available')">Available</button><button class="small-btn" onclick="setEq('${x.id}','maintenance')">Maintenance</button><button class="small-btn red" onclick="removeEq('${x.id}')">Remove</button></div></div>`;
 }
 const cover=x.image_url||x.gallery?.[0]?.public_url||'';
 return `<article class="nexus-eq-card" onclick="openEquipmentDetails('${x.id}')" tabindex="0" onkeydown="if(event.key==='Enter')openEquipmentDetails('${x.id}')">
   <div class="nexus-eq-media">${cover?`<img src="${esc(cover)}" alt="${esc(x.name)}">`:`<div class="eq-photo-placeholder">NEXUS</div>`}<span class="status eq-status">${esc(x.status)}</span></div>
   <div class="nexus-eq-body"><p class="eq-category">${esc(x.category||'Equipment')}</p><h3>${esc(x.name)}</h3><p class="eq-desc">${esc(x.description||'View equipment details, specifications, photos and rental information.')}</p>
   <div class="eq-price-grid"><div><small>DAILY</small><b>${money(x.daily_rate)}</b></div><div><small>WEEKLY</small><b>${money(x.weekly_rate)}</b></div></div>
   <button type="button" class="eq-details-btn" onclick="event.stopPropagation();openEquipmentDetails('${x.id}')">View Details <span>→</span></button></div>
 </article>`;
}
window.requestRental=async(id,name)=>{
 const {data:eq,error:eqErr}=await db.from('equipment').select('*').eq('id',id).single();
 if(eqErr)return msg(eqErr.message);
 if(eq.status!=='available'||eq.available===false)return msg('This equipment is currently unavailable or under maintenance.');

 const {data:bookings,error:bErr}=await db.from('rental_requests')
   .select('start_date,end_date,status')
   .eq('equipment_id',id)
   .in('status',['contract_required','confirmed','active']);
 if(bErr)return msg(bErr.message);

 const blocked=(bookings||[]).map(b=>({start:b.start_date,end:b.end_date,status:b.status}));
 let modal=document.getElementById('rentalRequestModal');
 if(!modal){modal=document.createElement('div');modal.id='rentalRequestModal';document.body.appendChild(modal)}
 const today=new Date().toISOString().slice(0,10);

 const conflicts=(start,end)=>blocked.some(b=>start<=b.end && end>=b.start);
 const blockedHtml=blocked.length?blocked.map(b=>`<div class="blocked-date-row"><b>${esc(b.start)}</b><span>through</span><b>${esc(b.end)}</b><em>UNAVAILABLE</em></div>`).join(''):'<div class="available-message">No approved rentals are currently blocking dates.</div>';

 modal.className='rental-form-modal';
 modal.innerHTML=`<div class="rental-form-card">
   <button class="rental-form-close" onclick="document.getElementById('rentalRequestModal').remove()">×</button>
   <p class="nexus-kicker">NEXUS EQUIPMENT RENTALS</p>
   <h2>Request ${esc(name)}</h2>
   <p class="muted">Select your dates below. Dates already reserved by another customer cannot be requested.</p>

   <div class="equipment-availability-banner ${eq.status==='maintenance'?'maintenance':''}">
     <span>Current Equipment Status</span><b>${esc((eq.status||'available').toUpperCase())}</b>
   </div>

   <div class="booking-calendar">
     <div class="booking-calendar-head"><h3>Availability Calendar</h3><span>Reserved dates</span></div>
     <div class="blocked-date-list">${blockedHtml}</div>
   </div>

   <form id="rentalRequestForm">
    <div class="rental-form-grid">
     <label>Start Date<input id="rentalStart" type="date" min="${today}" required></label>
     <label>End Date<input id="rentalEnd" type="date" min="${today}" required></label>
     <label>Job / Project Type<input id="rentalProject" type="text" placeholder="Excavation, grading, cleanup..."></label>
     <label>Job Site City<input id="rentalCity" type="text" placeholder="City"></label>
    </div>
    <div id="dateAvailabilityMessage" class="date-check-message">Choose start and end dates to check availability.</div>
    <label>Rental Notes<textarea id="rentalNotes" rows="4" placeholder="Job details, delivery needs, questions, etc."></textarea></label>
    <div class="rental-summary">
      <div><span>Equipment</span><b>${esc(name)}</b></div>
      ${eq.daily_rate?`<div><span>Daily Rate</span><b>${money(eq.daily_rate)}</b></div>`:''}
      ${eq.weekly_rate?`<div><span>Weekly Rate</span><b>${money(eq.weekly_rate)}</b></div>`:''}
      ${eq.deposit?`<div><span>Deposit</span><b>${money(eq.deposit)}</b></div>`:''}
    </div>
    <label class="rental-agree"><input id="rentalAgree" type="checkbox" required> I understand this request must be approved by Nexus.</label>
    <button id="rentalSubmitBtn" class="small-btn red rental-submit" type="submit">Submit Rental Request</button>
   </form>
 </div>`;

 const checkDates=()=>{
   const s=$('#rentalStart')?.value,e=$('#rentalEnd')?.value,notice=$('#dateAvailabilityMessage'),btn=$('#rentalSubmitBtn');
   if(!s||!e){notice.className='date-check-message';notice.textContent='Choose start and end dates to check availability.';btn.disabled=false;return}
   if(e<s){notice.className='date-check-message unavailable';notice.textContent='End date must be on or after the start date.';btn.disabled=true;return}
   if(conflicts(s,e)){notice.className='date-check-message unavailable';notice.textContent='Those dates overlap an existing rental. Please choose different dates.';btn.disabled=true;return}
   notice.className='date-check-message available';notice.textContent='✓ These dates are currently available.';btn.disabled=false;
 };
 $('#rentalStart').onchange=()=>{ $('#rentalEnd').min=$('#rentalStart').value||today; checkDates() };
 $('#rentalEnd').onchange=checkDates;

 $('#rentalRequestForm').onsubmit=async e=>{
   e.preventDefault();
   const startDate=$('#rentalStart').value,endDate=$('#rentalEnd').value;
   if(endDate<startDate)return msg('End date must be on or after the start date.');
   if(conflicts(startDate,endDate))return msg('Those dates are already reserved. Please choose different dates.');

   // Re-check the database immediately before submitting to reduce race conditions.
   const {data:freshEq}=await db.from('equipment').select('status,available').eq('id',id).single();
   if(!freshEq||freshEq.status!=='available'||freshEq.available===false)return msg('This equipment is no longer available.');
   const {data:fresh}=await db.from('rental_requests').select('start_date,end_date,status').eq('equipment_id',id).in('status',['contract_required','confirmed','active']);
   if((fresh||[]).some(b=>startDate<=b.end_date && endDate>=b.start_date))return msg('Those dates were just reserved. Please choose different dates.');

   const notes=[
     $('#rentalProject').value.trim()?`Project: ${$('#rentalProject').value.trim()}`:'',
     $('#rentalCity').value.trim()?`Job site city: ${$('#rentalCity').value.trim()}`:'',
     $('#rentalNotes').value.trim()
   ].filter(Boolean).join('\n');
   const btn=$('#rentalSubmitBtn');btn.disabled=true;btn.textContent='Submitting...';
   const {data:{user}}=await db.auth.getUser();
   const {data:newRental,error}=await db.from('rental_requests').insert({customer_id:user.id,equipment_id:id,start_date:startDate,end_date:endDate,customer_notes:notes||null}).select('id').single();
   if(error){btn.disabled=false;btn.textContent='Submit Rental Request';return msg(error.message)}
   // Best-effort admin push. The rental is already safely submitted even if push delivery fails.
   try{
    const {data:{session}}=await db.auth.getSession();
    if(session?.access_token&&newRental?.id)fetch('/api/notify-rental-request',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({rental_request_id:newRental.id})}).catch(()=>{});
   }catch(_){}
   modal.remove();msg('Rental request submitted to Nexus for approval.');loadCustomer();
 };
};

async function ensureAdminPushControls(){
 if(document.getElementById('nexusNotificationCenter'))return;
 const host=document.querySelector('.admin-tabs')?.parentElement||document.querySelector('.admin-shell')||document.querySelector('main');
 if(!host)return;
 const box=document.createElement('section');box.id='nexusNotificationCenter';box.className='nexus-notification-center';
 box.innerHTML=`<div class="nnc-head"><div><span class="nnc-kicker">ADMIN ALERTS</span><h3>🔔 Notification Center</h3><p>Set this once. Nexus will automatically send the alerts you choose.</p></div><span id="nncSaved" class="nnc-saved"></span></div>
 <div class="nnc-grid">
  <label><span>Notification Email</span><input id="nncEmail" type="email" placeholder="manager@example.com"></label>
  <div><span class="nnc-label">This Device</span><button id="enableNexusPush" type="button" class="nnc-push">Enable Push Notifications</button><small id="nexusPushStatus">Push not enabled on this device.</small></div>
 </div>
 <div class="nnc-section"><b>Delivery Methods</b><label class="nnc-check"><input id="nncPush" type="checkbox" checked> Push notifications</label><label class="nnc-check"><input id="nncEmailOn" type="checkbox" checked> Email</label></div>
 <div class="nnc-section"><b>Notify me when</b><div class="nnc-events">
  <label class="nnc-check"><input id="nncRental" type="checkbox" checked> New rental request</label>
  <label class="nnc-check"><input id="nncContract" type="checkbox" checked> Contract signed</label>
  <label class="nnc-check"><input id="nncPayment" type="checkbox" checked> Payment received</label>
  <label class="nnc-check"><input id="nncMessage" type="checkbox" checked> Customer message</label>
  <label class="nnc-check"><input id="nncCancel" type="checkbox" checked> Rental cancelled</label>
  <label class="nnc-check"><input id="nncReturn" type="checkbox" checked> Equipment due back / overdue</label>
 </div></div>
 <div class="nnc-actions"><button id="nncSave" class="nnc-save">Save Notification Settings</button><button id="nncTest" class="nnc-test">Send Test Notification</button></div>`;
 host.prepend(box);
 document.getElementById('enableNexusPush').onclick=enableNexusAdminPush;
 document.getElementById('nncSave').onclick=saveNexusNotificationSettings;
 document.getElementById('nncTest').onclick=testNexusNotification;
 await loadNexusNotificationSettings();
}
async function loadNexusNotificationSettings(){
 try{
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)return;
  const r=await fetch('/api/admin-notification-settings',{headers:{Authorization:`Bearer ${session.access_token}`}});const o=await r.json();if(!r.ok)return;
  const x=o.settings||{};document.getElementById('nncEmail').value=x.notification_email||session.user?.email||'';
  [['nncPush','push_enabled'],['nncEmailOn','email_enabled'],['nncRental','new_rental'],['nncContract','contract_signed'],['nncPayment','payment_received'],['nncMessage','customer_message'],['nncCancel','rental_cancelled'],['nncReturn','return_reminder']].forEach(([a,b])=>{const e=document.getElementById(a);if(e)e.checked=x[b]!==false});
  if(Notification.permission==='granted')document.getElementById('nexusPushStatus').textContent='✓ Browser permission granted. Enable/register this device if needed.';
 }catch(_){}
}
async function saveNexusNotificationSettings(){
 try{
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw new Error('Please sign in again.');
  const body={notification_email:document.getElementById('nncEmail').value.trim(),push_enabled:document.getElementById('nncPush').checked,email_enabled:document.getElementById('nncEmailOn').checked,new_rental:document.getElementById('nncRental').checked,contract_signed:document.getElementById('nncContract').checked,payment_received:document.getElementById('nncPayment').checked,customer_message:document.getElementById('nncMessage').checked,rental_cancelled:document.getElementById('nncCancel').checked,return_reminder:document.getElementById('nncReturn').checked};
  const r=await fetch('/api/admin-notification-settings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});const o=await r.json();if(!r.ok)throw new Error(o.error||'Could not save settings.');
  document.getElementById('nncSaved').textContent='✓ Saved';setTimeout(()=>document.getElementById('nncSaved').textContent='',2500);msg('Notification settings saved.');
 }catch(e){msg(e.message)}
}
async function testNexusNotification(){
 try{await saveNexusNotificationSettings();const {data:{session}}=await db.auth.getSession();const r=await fetch('/api/test-admin-notification',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}});
  const raw=await r.text();let o={};try{o=raw?JSON.parse(raw):{}}catch(_){o={error:raw||'Server returned an invalid response.'}}
  if(!r.ok)throw new Error(o.error||`Notification test failed (${r.status}).`);
  msg(`Test sent. Push: ${o.push_sent||0}${o.email_sent?' • Email: sent':''}`)}catch(e){msg(e.message)}
}
async function enableNexusAdminPush(){
 try{
  if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Push notifications are not supported in this browser.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not allowed.');
  const reg=await navigator.serviceWorker.register('/nexus-sw.js');
  const keyRes=await fetch('/api/push-public-key');const keyOut=await keyRes.json();if(!keyRes.ok)throw new Error(keyOut.error||'Push is not configured yet.');
  const b64=keyOut.publicKey.replace(/-/g,'+').replace(/_/g,'/');const raw=Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length/4)*4,'=')),c=>c.charCodeAt(0));
  let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:raw});
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw new Error('Please sign in again.');
  const res=await fetch('/api/save-push-subscription',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(sub)});
  const out=await res.json();if(!res.ok)throw new Error(out.error||'Could not save push notifications.');
  document.getElementById('nexusPushStatus').textContent='✓ Push notifications enabled on this device.';document.getElementById('nncPush').checked=true;await saveNexusNotificationSettings();msg('Push notifications enabled.');
 }catch(e){msg(e.message)}
}

async function loadAdmin(){
 ensureAdminPushControls();
 // Load the three tables separately. This avoids the rental list disappearing
 // when Supabase cannot resolve the profiles foreign-key relationship.
 const [pc,rr,eq]=await Promise.all([
  db.from('profiles').select('*').order('created_at',{ascending:false}),
  db.from('rental_requests').select('*').order('created_at',{ascending:false}),
  db.from('equipment').select('*').order('created_at',{ascending:false})
 ]);

 if(pc.error)msg('Customers error: '+pc.error.message);
 if(rr.error)msg('Rental requests error: '+rr.error.message);
 if(eq.error)msg('Equipment error: '+eq.error.message);

 adminCustomers=pc.data||[];
 adminEquipment=eq.data||[];

 const customerMap=Object.fromEntries(adminCustomers.map(x=>[x.id,x]));
 const equipmentMap=Object.fromEntries(adminEquipment.map(x=>[x.id,x]));
 adminRentals=(rr.data||[]).map(r=>({
   ...r,
   profiles:customerMap[r.customer_id]||null,
   equipment:equipmentMap[r.equipment_id]||null
 }));

 renderStats(); renderCustomers(); renderRentals(); renderEquipment(); renderCalendar(); loadAdminPaymentRequests(); ensureAdminPaymentCenter();
 await loadAdminContracts();
}
function renderStats(){
 const pendingC=adminCustomers.filter(x=>x.approval_status==='pending'||x.approval_status==='more_info');
 const pendingR=adminRentals.filter(x=>x.status==='pending');
 $('#statEquipment').textContent=adminEquipment.length;
 $('#statAvailable').textContent=adminEquipment.filter(x=>x.status==='available').length;
 $('#statMaintenance').textContent=adminEquipment.filter(x=>x.status==='maintenance').length;
 $('#statActive').textContent=adminRentals.filter(x=>x.status==='active').length;
 $('#statPendingCustomers').textContent=pendingC.length;
 $('#statPendingRentals').textContent=pendingR.length;
 $('#pendingBadge').textContent=pendingC.length?pendingC.length:'';
 $('#rentalBadge').textContent=pendingR.length?pendingR.length:'';
 $('#attentionList').innerHTML=[...pendingC.slice(0,3).map(x=>`<div class="notice"><b>Customer approval:</b> ${esc(x.full_name||x.email)}</div>`),...pendingR.slice(0,3).map(x=>`<div class="notice"><b>Rental request:</b> ${esc(x.equipment?.name||'Equipment')}</div>`)].join('')||'Nothing urgent right now.';
 const upcoming=adminRentals.filter(x=>['contract_required','confirmed','active'].includes(x.status)).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,5);
 $('#upcomingList').innerHTML=upcoming.length?upcoming.map(x=>`<div class="notice"><b>${esc(x.equipment?.name||'Equipment')}</b><br>${esc(x.profiles?.full_name||x.profiles?.email||'Customer')}<br>${x.start_date} → ${x.end_date}</div>`).join(''):'No upcoming rentals.';
}
function renderCustomers(){
 const q=($('#customerSearch')?.value||'').toLowerCase();
 const rows=adminCustomers.filter(x=>!q||`${x.full_name||''} ${x.email||''} ${x.business_name||''}`.toLowerCase().includes(q));
 $('#customerTable').innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>{
  const status=x.approval_status||'pending', approved=status==='approved';
  return `<tr><td><b>${esc(x.full_name||'No name')}</b><small>${esc(x.email||'')}</small>${x.business_name?`<small>${esc(x.business_name)}</small>`:''}</td><td>${esc(x.account_type||'individual')}</td><td><span class="status">${esc(status.replaceAll('_',' '))}</span></td><td>${esc(x.phone||'—')}</td><td><div class="admin-actions">
   <button class="small-btn" onclick="openCustomerProfile('${x.id}')">View Profile</button>
   ${!approved?`<button class="small-btn red" onclick="setCustomer('${x.id}','approved')">Approve</button>`:`<button class="small-btn approved-btn" disabled>✓ Approved</button>`}
   <button class="small-btn" onclick="openMoreInfoMessage('${x.id}')">More Info</button>
   <button class="small-btn" onclick="openCustomerMessage('${x.id}')">Send Message</button>
   ${!approved?`<button class="small-btn" onclick="setCustomer('${x.id}','rejected')">Reject</button>`:''}
  </div></td></tr>`}).join('')}</tbody></table>`
}
$('#customerSearch').oninput=renderCustomers;
window.setCustomer=async(id,status)=>{
 if(status==='approved'&&!confirm('Approve this customer account?'))return;
 if(status==='rejected'&&!confirm('Reject this customer account?'))return;
 const {error}=await db.from('profiles').update({approval_status:status}).eq('id',id);
 if(error)return msg(error.message);
 msg(status==='approved'?'Customer approved.':status==='rejected'?'Customer rejected.':'Customer status updated.');
 loadAdmin();
};



window.openCustomerProfile=async id=>{
 const c=adminCustomers.find(x=>x.id===id);
 if(!c)return msg('Customer not found.');

 let verification=null, rentals=[];
 try{
  const vr=await db.from('customer_verifications').select('*').eq('user_id',id).maybeSingle();
  if(vr.error && vr.error.code!=='PGRST116')console.warn(vr.error);
  verification=vr.data||null;
 }catch(e){console.warn(e)}
 try{
  const rr=await db.from('rental_requests').select('*').eq('customer_id',id).order('created_at',{ascending:false});
  rentals=rr.data||[];
 }catch(e){console.warn(e)}

 const equipmentMap=Object.fromEntries((adminEquipment||[]).map(e=>[e.id,e]));
 const signed=async path=>{
  if(!path)return null;
  try{
   const {data,error}=await db.storage.from('customer-verification-documents').createSignedUrl(path,600);
   return error?null:data?.signedUrl;
  }catch(e){return null}
 };
 const [frontUrl,backUrl]=await Promise.all([signed(verification?.license_front_path),signed(verification?.license_back_path)]);

 let modal=document.getElementById('customerProfileModal');
 if(!modal){modal=document.createElement('div');modal.id='customerProfileModal';document.body.appendChild(modal)}
 const status=c.approval_status||'pending';
 const verified=verification?.status||'not_submitted';
 modal.className='customer-profile-modal';
 modal.innerHTML=`<div class="customer-profile-card">
  <div class="profile-modal-head"><div><p class="nexus-kicker">NEXUS CUSTOMER PROFILE</p><h2>${esc(c.full_name||'Customer')}</h2><p>${esc(c.email||'')}</p></div><button class="profile-modal-close" onclick="document.getElementById('customerProfileModal').remove()">×</button></div>
  <div class="profile-status-row"><span>Account: <b>${esc(status.replaceAll('_',' '))}</b></span><span>Identity: <b>${esc(verified.replaceAll('_',' '))}</b></span></div>
  <div id="profilePaymentStatus-${id}" class="profile-payment-status"><span class="payment-kicker">PAYMENT STATUS</span><b>Loading…</b></div>

  <div class="profile-modal-grid">
   <section><h3>Account Information</h3>
    <div class="profile-field"><small>Full Name</small><b>${esc(c.full_name||'—')}</b></div>
    <div class="profile-field"><small>Email</small><b>${esc(c.email||'—')}</b></div>
    <div class="profile-field"><small>Phone</small><b>${esc(c.phone||'—')}</b></div>
    <div class="profile-field"><small>Account Type</small><b>${esc(c.account_type||'individual')}</b></div>
    <div class="profile-field"><small>Business</small><b>${esc(c.business_name||'—')}</b></div>
   </section>
   <section><h3>Identity Verification</h3>
    <div class="profile-field"><small>Legal Name</small><b>${esc(verification?`${verification.legal_first_name||''} ${verification.legal_last_name||''}`.trim()||'—':'Not submitted')}</b></div>
    <div class="profile-field"><small>Address</small><b>${esc(verification?[verification.address_line1,verification.city,verification.state,verification.postal_code].filter(Boolean).join(', ')||'—':'—')}</b></div>
    <div class="profile-field"><small>Driver License</small><b>${esc(verification?.license_number||'—')} ${verification?.license_state?`(${esc(verification.license_state)})`:''}</b></div>
    <div class="profile-field"><small>License Expiration</small><b>${esc(verification?.license_expiration||'—')}</b></div>
    <div class="profile-field"><small>${esc((verification?.tax_id_type||'Tax ID').toUpperCase())} Last 4</small><b>${esc(verification?.tax_id_last4?`•••• ${verification.tax_id_last4}`:'—')}</b></div>
    <div class="license-links">${frontUrl?`<a href="${frontUrl}" target="_blank" rel="noopener">View License Front</a>`:''}${backUrl?`<a href="${backUrl}" target="_blank" rel="noopener">View License Back</a>`:''}${!frontUrl&&!backUrl?'<span>No license images available</span>':''}</div>
   </section>
  </div>

  ${verification?.admin_notes?`<div class="profile-note"><small>Verification / Admin Note</small><p>${esc(verification.admin_notes)}</p></div>`:''}
  ${c.more_info_request?`<div class="profile-note warning"><small>More Information Request</small><p>${esc(c.more_info_request)}</p></div>`:''}

  <section class="profile-contracts"><div class="profile-section-head"><h3>Contracts & Signatures</h3><p class="muted">See whether each agreement was signed and open or download its signature record.</p></div><div id="profileContracts-${id}"><div class="notice">Loading contracts…</div></div></section>

  <section class="profile-rentals"><h3>Rental History</h3>
   ${rentals.length?rentals.map(r=>{const e=equipmentMap[r.equipment_id];return `<div class="profile-rental-row"><div><b>${esc(e?.name||'Equipment')}</b><small>${esc(r.start_date||'—')} → ${esc(r.end_date||'—')}</small></div><div class="profile-rental-actions">
 <span class="status">${esc((r.status||'pending').replaceAll('_',' '))}</span>
 ${r.status==='confirmed'?`<button class="small-btn" onclick="openPaymentRequest('${id}','${r.id}')">💳 Request Payment</button><button class="small-btn red pickup-btn" onclick="markRentalPickedUpFromProfile('${r.id}','${id}')">🔒 Verify Payment / Pick Up</button>`:''}
 ${r.status==='active'?`<button class="small-btn return-btn" onclick="markRentalReturnedFromProfile('${r.id}','${id}')">↩ Return Equipment</button>`:''}
 ${r.status==='completed'?`<button class="small-btn approved-btn" disabled>✓ Returned</button>`:''}
</div></div>`}).join(''):'<p class="muted">No rental requests yet.</p>'}
  </section>

  <div class="profile-modal-actions">
   ${status!=='approved'?`<button class="small-btn red" onclick="setCustomer('${id}','approved');document.getElementById('customerProfileModal')?.remove()">Approve Account</button>`:'<button class="small-btn approved-btn" disabled>✓ Account Approved</button>'}
   <button class="small-btn" onclick="document.getElementById('customerProfileModal')?.remove();openMoreInfoMessage('${id}')">More Info</button>
   <button class="small-btn" onclick="document.getElementById('customerProfileModal')?.remove();openCustomerMessage('${id}')">Send Message</button>
   <button class="small-btn red" onclick="openPaymentRequest('${id}')">💳 Send Payment Request</button>
   ${verification?.status!=='verified'?`<button class="small-btn" onclick="verifyCustomerIdentity('${id}')">Verify Identity</button>`:'<button class="small-btn approved-btn" disabled>✓ Identity Verified</button>'}
  </div>
 </div>`;
 await loadCustomerPaymentStatus(id);
 await loadCustomerContractsForAdmin(id);
};



async function loadCustomerContractsForAdmin(customerId){
 const mount=document.getElementById(`profileContracts-${customerId}`);if(!mount)return;
 const {data:contracts,error}=await db.from('rental_contracts').select('*').eq('customer_id',customerId).order('signed_at',{ascending:false});
 if(error){mount.innerHTML=`<div class="notice">Could not load contracts: ${esc(error.message)}</div>`;return}
 const rentals=(adminRentals||[]).filter(r=>r.customer_id===customerId),byRental=Object.fromEntries((contracts||[]).map(c=>[c.rental_request_id,c]));
 if(!rentals.length){mount.innerHTML='<div class="notice">No rental contracts yet.</div>';return}
 mount.innerHTML=rentals.map(r=>{const c=byRental[r.id],eq=(adminEquipment||[]).find(e=>e.id===r.equipment_id),signed=!!(c?.accepted&&c?.signed_at);return `<div class="customer-contract-row"><div class="contract-main"><b>${esc(eq?.name||'Equipment Rental')}</b><small>${esc(r.start_date||'—')} → ${esc(r.end_date||'—')}</small></div><div class="contract-sign-status ${signed?'signed':'unsigned'}">${signed?'✓ SIGNED':'NOT SIGNED'}</div><div class="contract-sign-details">${signed?`<small>Signed by</small><b>${esc(c.signature_name||'Customer')}</b><small>${new Date(c.signed_at).toLocaleString()}</small><small>Version ${esc(c.contract_version||'—')}</small>`:'<small>Waiting for customer signature</small>'}</div><div class="contract-profile-actions">${signed?`<button class="small-btn" onclick="viewSignedContract('${r.id}')">View</button><button class="small-btn" onclick="downloadSignedContractRecord('${r.id}')">Download</button>`:'<button class="small-btn" disabled>Awaiting Signature</button>'}</div></div>`}).join('');
}
window.downloadSignedContractRecord=async rentalId=>{
 const {data:c,error}=await db.from('rental_contracts').select('*').eq('rental_request_id',rentalId).maybeSingle();if(error)return msg(error.message);if(!c)return msg('No signed contract found.');
 const r=(adminRentals||[]).find(x=>x.id===rentalId),eq=(adminEquipment||[]).find(e=>e.id===r?.equipment_id),customer=(adminCustomers||[]).find(x=>x.id===c.customer_id);
 const text=['NEXUS EQUIPMENT RENTALS','SIGNED RENTAL CONTRACT RECORD','',`Customer: ${c.signature_name||customer?.full_name||customer?.email||'Customer'}`,`Equipment: ${eq?.name||'Equipment'}`,`Rental Dates: ${r?.start_date||'—'} to ${r?.end_date||'—'}`,`Contract Version: ${c.contract_version||'—'}`,`Accepted: ${c.accepted?'Yes':'No'}`,`Signed At: ${c.signed_at?new Date(c.signed_at).toLocaleString():'—'}`].join('\n');
 const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Nexus-Signed-Contract-${rentalId}.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
};


async function getRentalPaymentState(rentalId){
 const {data:rows,error}=await db.from('payment_requests').select('id,amount,status,title,paid_at').eq('rental_request_id',rentalId);
 if(error)return {error,required:false,paid:false,due:0,paidAmount:0,rows:[]};
 const list=rows||[],required=list.length>0;
 const unpaid=list.filter(x=>x.status!=='paid'&&x.status!=='cancelled');
 const paid=list.filter(x=>x.status==='paid');
 return {required,paid:required&&unpaid.length===0,due:unpaid.reduce((a,x)=>a+Number(x.amount||0),0),paidAmount:paid.reduce((a,x)=>a+Number(x.amount||0),0),rows:list};
}
async function enforcePaidBeforePickup(rentalId){
 const state=await getRentalPaymentState(rentalId);
 if(state.error){msg('Could not verify payment status. Pickup is blocked for safety.');return false}
 if(!state.required){msg('🔒 PAYMENT REQUIRED — Create a payment request for this rental before equipment can be released.');return false}
 if(!state.paid){msg(`🔒 PAYMENT REQUIRED — ${money(state.due)} must be paid before this equipment can be released.`);return false}
 return true;
}

window.markRentalPickedUpFromProfile=async(rentalId,customerId)=>{
 const rental=adminRentals.find(x=>x.id===rentalId);
 if(!rental)return msg('Rental not found.');
 if(rental.status!=='confirmed')return msg('🔒 CONTRACT REQUIRED — The rental must be signed and confirmed before pickup.');
 if(!(await enforcePaidBeforePickup(rentalId)))return;
 if(!confirm('Payment is confirmed. Mark this equipment PICKED UP and make the rental Active?'))return;
 const {error}=await db.from('rental_requests').update({status:'active'}).eq('id',rentalId);
 if(error)return msg(error.message);
 if(rental.equipment_id)await db.from('equipment').update({status:'rented',available:false}).eq('id',rental.equipment_id);
 msg('Equipment marked Picked Up. Rental is now Active.');
 await loadAdmin();
 await openCustomerProfile(customerId);
};
window.markRentalReturnedFromProfile=async(rentalId,customerId)=>{
 const rental=adminRentals.find(x=>x.id===rentalId);
 if(!rental)return msg('Rental not found.');
 if(rental.status!=='active')return msg('Only an Active rental can be returned.');
 if(!confirm('Confirm the customer has RETURNED this equipment? This will complete the rental and make the equipment available again.'))return;
 const {error}=await db.from('rental_requests').update({status:'completed'}).eq('id',rentalId);
 if(error)return msg(error.message);
 if(rental.equipment_id)await db.from('equipment').update({status:'available',available:true}).eq('id',rental.equipment_id);
 msg('Equipment returned. Rental is Completed and equipment is Available.');
 await loadAdmin();
 await openCustomerProfile(customerId);
};

window.verifyCustomerIdentity=async id=>{
 if(!confirm('Mark this customer identity as verified?'))return;
 const {data:v,error:findError}=await db.from('customer_verifications').select('id').eq('user_id',id).maybeSingle();
 if(findError)return msg(findError.message);
 if(!v?.id)return msg('This customer has not submitted identity verification yet.');
 const {error}=await db.from('customer_verifications').update({status:'verified',reviewed_at:new Date().toISOString()}).eq('id',v.id);
 if(error)return msg(error.message);
 msg('Identity verified.');
 document.getElementById('customerProfileModal')?.remove();
 loadAdmin();
};

window.openMoreInfoMessage=id=>{
 const c=adminCustomers.find(x=>x.id===id);if(!c)return msg('Customer not found.');
 openAdminMessageModal(id,'Request More Information',c.full_name||c.email||'Customer','Tell the customer exactly what Nexus needs before approval...','Send More Info Request','more_info');
};
window.openCustomerMessage=id=>{
 const c=adminCustomers.find(x=>x.id===id);if(!c)return msg('Customer not found.');
 openAdminMessageModal(id,'Send Customer Message',c.full_name||c.email||'Customer','Write a message for this customer...','Send Message','message');
};
function openAdminMessageModal(id,title,subtitle,placeholder,label,mode){
 let modal=document.getElementById('adminCustomerMessageModal');if(!modal){modal=document.createElement('div');modal.id='adminCustomerMessageModal';document.body.appendChild(modal)}
 modal.className='admin-message-modal';modal.innerHTML=`<div class="admin-message-card"><button class="admin-message-close" onclick="document.getElementById('adminCustomerMessageModal').remove()">×</button><p class="nexus-kicker">NEXUS ADMIN</p><h2>${esc(title)}</h2><p class="muted">${esc(subtitle)}</p><textarea id="adminCustomerMessageText" rows="6" placeholder="${esc(placeholder)}"></textarea><div class="admin-message-actions"><button class="small-btn red" onclick="submitCustomerMessage('${id}','${mode}')">${esc(label)}</button><button class="small-btn" onclick="document.getElementById('adminCustomerMessageModal').remove()">Cancel</button></div></div>`;
}
window.submitCustomerMessage=async(id,mode)=>{
 const text=$('#adminCustomerMessageText')?.value.trim();if(!text)return msg('Enter a message first.');
 if(mode==='more_info'){
  const {error}=await db.from('profiles').update({approval_status:'more_info',more_info_request:text,more_info_requested_at:new Date().toISOString()}).eq('id',id);
  if(error)return msg(error.message);
  const {data:v}=await db.from('customer_verifications').select('id').eq('user_id',id).maybeSingle();
  if(v?.id)await db.from('customer_verifications').update({status:'needs_attention',admin_notes:text}).eq('id',v.id);
  document.getElementById('adminCustomerMessageModal')?.remove();msg('More information request sent.');return loadAdmin();
 }
 const {error}=await db.from('profiles').update({admin_message:text,admin_message_at:new Date().toISOString()}).eq('id',id);
 if(error)return msg(error.message);
 document.getElementById('adminCustomerMessageModal')?.remove();msg('Message sent to the customer portal.');loadAdmin();
};

function renderRentals(){
 const filter=$('#rentalFilter');
 const f=filter?.value||'all';
 const rows=adminRentals.filter(x=>f==='all'||x.status===f);
 const table=$('#rentalTable');
 if(!table)return;
 if(!rows.length){table.innerHTML=`<div class="notice">No ${f==='all'?'rental requests':esc(f)+' rental requests'} found.</div>`;return}
 table.innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Equipment</th><th>Dates</th><th>Status</th><th>Request Details</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr>
  <td><b>${esc(x.profiles?.full_name||x.profiles?.email||'Customer')}</b><small>${esc(x.profiles?.email||'')}</small><small>${esc(x.profiles?.phone||'')}</small></td>
  <td><b>${esc(x.equipment?.name||'Equipment')}</b></td>
  <td>${esc(x.start_date||'—')}<br><small>to ${esc(x.end_date||'—')}</small></td>
  <td><span class="status">${esc((x.status||'pending').replaceAll('_',' '))}</span></td>
  <td><small style="white-space:pre-line">${esc(x.customer_notes||'No notes submitted')}</small></td>
  <td><div class="admin-actions">
    ${x.status==='pending'?`<button class="small-btn red" onclick="approveRentalForContract('${x.id}')">Approve</button>`:''}
    ${x.status==='contract_required'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">Contract Pending</button>`:''}
    ${x.status==='confirmed'?`<button class="small-btn red" onclick="adminMarkPickedUp('${x.id}')">🔒 Verify Payment / Pick Up</button>`:''}
    ${x.status==='confirmed'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">View Contract</button>`:''}
    ${x.status==='active'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">View Contract</button><button class="small-btn red return-btn" onclick="adminMarkReturned('${x.id}')">↩ Return Equipment</button>`:''}
    ${x.status==='completed'?`<button class="small-btn approved-btn" disabled>✓ Returned</button>`:''}
    ${['pending','approved','contract_required','confirmed'].includes(x.status)?`<button class="small-btn" onclick="setRental('${x.id}','rejected')">Reject</button>`:''}
  </div></td>
 </tr>`).join('')}</tbody></table>`;
}


window.adminMarkPickedUp=async id=>{
 const r=adminRentals.find(x=>x.id===id);if(!r)return msg('Rental not found.');
 if(r.status!=='confirmed')return msg('🔒 CONTRACT REQUIRED — The rental must be signed and confirmed before pickup.');
 if(!(await enforcePaidBeforePickup(id)))return;
 if(!confirm('Payment is confirmed. Mark this equipment PICKED UP?'))return;
 const {error}=await db.from('rental_requests').update({status:'active'}).eq('id',id);if(error)return msg(error.message);
 if(r.equipment_id)await db.from('equipment').update({status:'rented',available:false}).eq('id',r.equipment_id);
 msg('Picked Up — rental is Active.');loadAdmin();
};
window.adminMarkReturned=async id=>{
 const r=adminRentals.find(x=>x.id===id);if(!r)return msg('Rental not found.');
 if(!confirm('Confirm this equipment was RETURNED?'))return;
 const {error}=await db.from('rental_requests').update({status:'completed'}).eq('id',id);if(error)return msg(error.message);
 if(r.equipment_id)await db.from('equipment').update({status:'available',available:true}).eq('id',r.equipment_id);
 msg('Returned — rental Completed and equipment is Available.');loadAdmin();
};

window.approveRentalForContract=async id=>{
 const rental=adminRentals.find(x=>x.id===id);
 if(!rental)return msg('Rental request not found.');
 // Reuse DB double-booking protection; contract_required reserves dates too after SQL migration.
 const {error}=await db.from('rental_requests').update({status:'contract_required'}).eq('id',id);
 if(error)return msg(error.message);
 msg('Rental approved. Customer must now sign the contract.');
 loadAdmin();
};

window.openRentalContract=async id=>{
 const {data:{user}}=await db.auth.getUser();
 const {data:r,error}=await db.from('rental_requests').select('*').eq('id',id).eq('customer_id',user.id).maybeSingle();
 if(error)return msg(error.message);if(!r)return msg('Rental request not found.');
 if(!['approved','contract_required'].includes(r.status))return msg('This rental is not awaiting a contract.');
 const [profileRes,verificationRes,equipmentRes,templateRes]=await Promise.all([
  db.from('profiles').select('*').eq('id',user.id).maybeSingle(),
  db.from('customer_verifications').select('*').eq('user_id',user.id).maybeSingle(),
  db.from('equipment').select('*').eq('id',r.equipment_id).maybeSingle(),
  db.from('contract_templates').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 const p=profileRes.data,v=verificationRes.data,eq=equipmentRes.data,t=templateRes.data;
 const templateError=templateRes.error;
 const legalName=[v?.legal_first_name,v?.legal_last_name].filter(Boolean).join(' ')||p?.full_name||'';
 const address=[v?.address_line1,v?.city,v?.state,v?.postal_code].filter(Boolean).join(', ');
 let pdfUrl=null;if(t?.storage_path){const sr=await db.storage.from('rental-contract-templates').createSignedUrl(t.storage_path,1800);pdfUrl=sr.data?.signedUrl||null}
 let modal=document.getElementById('rentalContractModal');if(!modal){modal=document.createElement('div');modal.id='rentalContractModal';document.body.appendChild(modal)}
 modal.className='contract-modal';modal.dataset.templateId=t?.id||'';modal.dataset.templateVersion=t?.version||'1.0';modal.dataset.templateName=t?.name||'Nexus Equipment Rental Agreement';modal.dataset.templatePath=t?.storage_path||'';
 modal.innerHTML=`<div class="contract-card customer-contract-card">
  <button class="contract-close" onclick="document.getElementById('rentalContractModal').remove()">×</button><p class="nexus-kicker">NEXUS EQUIPMENT RENTALS</p><h2>Review & Sign Rental Agreement</h2>
  <div class="contract-autofill-banner">✓ Your account and rental information has been automatically filled in. Review it before signing.</div>
  <div class="contract-summary">
   <div><span>Legal Name</span><b>${esc(legalName||user.email)}</b></div><div><span>Email</span><b>${esc(p?.email||user.email)}</b></div>
   <div><span>Phone</span><b>${esc(p?.phone||'—')}</b></div><div><span>Address</span><b>${esc(address||'—')}</b></div>
   <div><span>Equipment</span><b>${esc(eq?.name||'Equipment')}</b></div><div><span>Rental Period</span><b>${esc(r.start_date)} → ${esc(r.end_date)}</b></div>
   <div><span>Daily Rate</span><b>${money(eq?.daily_rate)}</b></div><div><span>Weekly Rate</span><b>${money(eq?.weekly_rate)}</b></div><div><span>Deposit</span><b>${money(eq?.deposit)}</b></div>
  </div>
  ${pdfUrl?`<div class="uploaded-contract-box"><div><b>${esc(t.name)}</b><small>Version ${esc(t.version)}</small></div><a class="small-btn" href="${pdfUrl}" target="_blank" rel="noopener">Open Full PDF Contract</a></div>`:`<div class="contract-warning"><b>${templateError?'Contract access error':'No uploaded PDF is active.'}</b> ${templateError?esc(templateError.message):'Nexus should activate a contract in Admin → Contracts before relying on this signing flow.'}</div>`}
  <div class="contract-terms"><h3>Electronic Signature</h3><p>By signing below, you confirm that you reviewed the rental details and the active rental agreement shown above, and you intend your typed name and submission to serve as your electronic signature.</p></div>
  <label class="contract-check"><input id="contractAccept" type="checkbox"> I reviewed the rental information and contract and agree to sign electronically.</label>
  <label>Electronic Signature<input id="contractSignature" class="contract-input" type="text" value="${esc(legalName)}" placeholder="Type your full legal name"></label>
  <p class="contract-esign">Your name is prefilled from your verified/account information. You may correct it before signing if needed.</p>
  <button type="button" class="small-btn red contract-submit" data-sign-rental="${id}">Sign & Confirm Rental</button>
 </div>`;
};
window.signRentalContract=async id=>{
 const btn=document.querySelector('.contract-submit'),accepted=$('#contractAccept')?.checked,signature=$('#contractSignature')?.value.trim();
 if(!accepted)return msg('You must review and accept the agreement before signing.');
 if(!signature)return msg('Type your full legal name as your electronic signature.');
 if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='SIGNING...'}
 try{
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session?.access_token)throw new Error('Your session expired. Please sign in again.');
  const modal=document.getElementById('rentalContractModal');
  const res=await fetch('/api/sign-contract',{
   method:'POST',
   headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
   body:JSON.stringify({
    rental_request_id:id,
    signature_name:signature,
    accepted:true,
    template_id:modal?.dataset.templateId||null,
    template_version:modal?.dataset.templateVersion||'1.0',
    template_name:modal?.dataset.templateName||'Nexus Equipment Rental Agreement',
    template_storage_path:modal?.dataset.templatePath||null
   })
  });
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(payload.error||`Signing request failed (${res.status}).`);
  // Contract is signed. The server now automatically creates the exact rental payment request.
  const payRes=await fetch('/api/create-rental-payment',{
   method:'POST',
   headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
   body:JSON.stringify({rental_request_id:id})
  });
  const payPayload=await payRes.json().catch(()=>({}));
  if(!payRes.ok)throw new Error(payPayload.error||`Contract signed, but payment setup failed (${payRes.status}).`);

  document.querySelectorAll(`[data-sign-rental="${id}"],[onclick*="openRentalContract('${id}')"]`).forEach(el=>el.remove());
  modal?.remove();
  await loadCustomer();
  const paymentId=payPayload.payment_request_id;
  const amount=Number(payPayload.amount||0);
  const payModal=authHelpModal(`<span class="auth-help-kicker">CONTRACT SIGNED ✓</span><h2>Payment Required</h2><p>Your rental is confirmed. Complete the required payment before equipment pickup.</p><div style="font-size:34px;font-weight:900;margin:20px 0">${money(amount)}</div><button id="contractPayNow" class="auth-help-primary">Pay Securely with Stripe</button><small class="auth-help-note">Your payment is processed securely by Stripe. Nexus does not store your card number.</small>`);
  payModal.querySelector('#contractPayNow').onclick=()=>payNexusRequest(paymentId,payModal.querySelector('#contractPayNow'));
 }catch(err){
  console.error('Contract signing failed:',err);const detail=err?.message||'Unknown signing error';msg('Contract could not be signed: '+detail);
  let box=document.getElementById('contractSignError');if(!box){box=document.createElement('div');box.id='contractSignError';box.className='contract-sign-error';btn?.insertAdjacentElement('beforebegin',box)}
  box.innerHTML=`<b>Could not sign contract</b><span>${esc(detail)}</span>`;
 }finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'SIGN & CONFIRM RENTAL'}}
};
window.viewMySignedContract=async id=>{
 const {data:{user}}=await db.auth.getUser();
 const {data:c,error}=await db.from('rental_contracts').select('*').eq('rental_request_id',id).eq('customer_id',user.id).maybeSingle();
 if(error)return msg(error.message);if(!c)return msg('Signed contract not found.');
 const snap=c.contract_snapshot||{};let pdfUrl=null;
 if(snap.template_storage_path){const sr=await db.storage.from('rental-contract-templates').createSignedUrl(snap.template_storage_path,1800);pdfUrl=sr.data?.signedUrl||null}
 let modal=document.getElementById('mySignedContractModal');if(!modal){modal=document.createElement('div');modal.id='mySignedContractModal';document.body.appendChild(modal)}
 modal.className='contract-modal';modal.innerHTML=`<div class="contract-card"><button class="contract-close" onclick="document.getElementById('mySignedContractModal').remove()">×</button><p class="nexus-kicker">YOUR SIGNED AGREEMENT</p><h2>${esc(snap.equipment_name||'Equipment Rental Agreement')}</h2><div class="contract-summary"><div><span>Name</span><b>${esc(snap.customer_name||c.signature_name)}</b></div><div><span>Email</span><b>${esc(snap.customer_email||'')}</b></div><div><span>Rental Period</span><b>${esc(snap.start_date||'')} → ${esc(snap.end_date||'')}</b></div><div><span>Contract Version</span><b>${esc(c.contract_version||snap.version||'—')}</b></div><div><span>Signed</span><b>${new Date(c.signed_at).toLocaleString()}</b></div></div><div class="signed-signature"><span>ELECTRONIC SIGNATURE</span><strong>${esc(c.signature_name)}</strong></div>${pdfUrl?`<a class="small-btn red signed-pdf-link" href="${pdfUrl}" target="_blank" rel="noopener">View Contract PDF</a>`:'<p class="muted">No PDF template was attached when this agreement was signed.</p>'}</div>`;
};
window.downloadMySignedContract=async id=>{
 const {data:{user}}=await db.auth.getUser();const {data:c,error}=await db.from('rental_contracts').select('*').eq('rental_request_id',id).eq('customer_id',user.id).maybeSingle();
 if(error)return msg(error.message);if(!c)return msg('Signed contract not found.');const s=c.contract_snapshot||{};
 const text=['NEXUS EQUIPMENT RENTALS','SIGNED RENTAL AGREEMENT RECORD','',`Customer: ${s.customer_name||c.signature_name}`,`Email: ${s.customer_email||user.email}`,`Address: ${s.customer_address||'—'}`,`Equipment: ${s.equipment_name||'Equipment'}`,`Rental Dates: ${s.start_date||'—'} to ${s.end_date||'—'}`,`Daily Rate: ${s.daily_rate??'—'}`,`Weekly Rate: ${s.weekly_rate??'—'}`,`Deposit: ${s.deposit??'—'}`,`Contract: ${s.template_name||'Nexus Equipment Rental Agreement'}`,`Version: ${c.contract_version||s.version||'—'}`,`Electronically Signed By: ${c.signature_name}`,`Signed At: ${new Date(c.signed_at).toLocaleString()}`].join('\n');
 const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Nexus-Signed-Rental-${id}.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
};

window.viewSignedContract=async id=>{
 const rental=adminRentals.find(x=>x.id===id);
 const {data:c,error}=await db.from('rental_contracts').select('*').eq('rental_request_id',id).maybeSingle();
 if(error)return msg(error.message);
 if(!c)return msg('The customer has not signed the contract yet.');
 const snap=c.contract_snapshot||{};
 let modal=document.getElementById('signedContractModal');
 if(!modal){modal=document.createElement('div');modal.id='signedContractModal';document.body.appendChild(modal)}
 modal.className='contract-modal';
 modal.innerHTML=`<div class="contract-card">
  <button class="contract-close" onclick="document.getElementById('signedContractModal').remove()">×</button>
  <p class="nexus-kicker">SIGNED RENTAL AGREEMENT</p><h2>${esc(snap.equipment_name||rental?.equipment?.name||'Equipment')}</h2>
  <div class="contract-summary">
   <div><span>Customer</span><b>${esc(snap.customer_name||rental?.profiles?.full_name||'Customer')}</b></div>
   <div><span>Email</span><b>${esc(snap.customer_email||rental?.profiles?.email||'')}</b></div>
   <div><span>Rental Period</span><b>${esc(snap.start_date||rental?.start_date||'')} → ${esc(snap.end_date||rental?.end_date||'')}</b></div>
   <div><span>Signed</span><b>${new Date(c.signed_at).toLocaleString()}</b></div>
  </div>
  <div class="signed-signature"><span>ELECTRONIC SIGNATURE</span><strong>${esc(c.signature_name)}</strong></div>
  <div class="contract-audit-box"><h3>E-Sign Audit Trail</h3><div><span>IP Address</span><b>${esc(c.signer_ip||'Not recorded')}</b></div><div><span>Browser / Device</span><b>${esc(c.signer_user_agent||'Not recorded')}</b></div><div><span>Signed UTC</span><b>${esc(c.signed_at||'—')}</b></div><div><span>Audit ID</span><b>${esc(c.id||'—')}</b></div></div>
  <p class="muted">Agreement version: ${esc(snap.terms_version||c.contract_version||'1.0')}</p>
 </div>`;
};

$('#rentalFilter').onchange=renderRentals;
window.setRental=async(id,status)=>{const {error}=await db.from('rental_requests').update({status}).eq('id',id);if(error)return msg(error.message);msg('Rental updated.');loadAdmin()};

function renderEquipment(){
 $('#adminEquipment').innerHTML=adminEquipment.length?adminEquipment.map(x=>eqCard(x,true,false)).join(''):'<div class="equipment-item">No equipment added yet.</div>';
 $('#fleetSummary').innerHTML=`<div class="mini-stat"><b>${adminEquipment.length}</b> total units</div><div class="mini-stat"><b>${adminEquipment.filter(x=>x.status==='available').length}</b> available</div><div class="mini-stat"><b>${adminEquipment.filter(x=>x.status==='maintenance').length}</b> maintenance</div>`;
}
window.setEq=async(id,status)=>{const {error}=await db.from('equipment').update({status,available:status==='available'}).eq('id',id);if(error)return msg(error.message);loadAdmin()};
window.removeEq=async id=>{if(confirm('Remove this equipment?')){const {error}=await db.from('equipment').delete().eq('id',id);if(error)return msg(error.message);loadAdmin()}};
window.editEq=async id=>{
 const x=adminEquipment.find(e=>e.id===id);if(!x)return msg('Equipment not found.');
 let modal=document.getElementById('editEquipmentModal');if(!modal){modal=document.createElement('div');modal.id='editEquipmentModal';document.body.appendChild(modal)}
 modal.className='equipment-edit-modal';
 modal.innerHTML=`<div class="equipment-edit-card">
  <button class="equipment-edit-close" onclick="document.getElementById('editEquipmentModal').remove()">×</button>
  <p class="nexus-kicker">NEXUS FLEET ADMIN</p><h2>Edit Equipment</h2><p class="muted">Update the full equipment listing, not just the name.</p>
  <form id="fullEquipmentEditForm">
   <div class="equipment-edit-grid">
    <label><span>Equipment Name</span><input id="editEqName" required value="${esc(x.name||'')}"></label>
    <label><span>Category</span><input id="editEqCategory" value="${esc(x.category||'')}" placeholder="Skid Steer, Excavator, Trailer..."></label>
    <label class="wide"><span>Description</span><textarea id="editEqDescription" rows="4" placeholder="Equipment description">${esc(x.description||'')}</textarea></label>
    <label><span>Daily Rate ($)</span><input id="editEqDaily" type="number" min="0" step="0.01" value="${x.daily_rate??''}"></label>
    <label><span>Weekly Rate ($)</span><input id="editEqWeekly" type="number" min="0" step="0.01" value="${x.weekly_rate??''}"></label>
    <label><span>Deposit ($)</span><input id="editEqDeposit" type="number" min="0" step="0.01" value="${x.deposit??''}"></label>
    <label><span>Quantity</span><input id="editEqQuantity" type="number" min="0" step="1" value="${x.quantity??1}"></label>
    <label><span>Status</span><select id="editEqStatus"><option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label>
    <label class="wide"><span>Cover Image URL</span><input id="editEqImage" value="${esc(x.image_url||'')}" placeholder="https://..."></label>
    <label class="wide"><span>Upload New Photos</span><input id="editEqPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>Optional — up to 8 new photos. First uploaded photo becomes the cover image.</small></label>
   </div>
   ${x.image_url?`<div class="current-equipment-image"><span>Current Cover</span><img src="${esc(x.image_url)}" alt="${esc(x.name||'Equipment')}"></div>`:''}
   <div class="equipment-edit-actions"><button class="small-btn red" type="submit">Save All Changes</button><button class="small-btn" type="button" onclick="document.getElementById('editEquipmentModal').remove()">Cancel</button></div>
  </form>
 </div>`;
 $('#editEqStatus').value=x.status||'available';
 $('#fullEquipmentEditForm').onsubmit=async e=>{
  e.preventDefault();const btn=e.target.querySelector('[type="submit"]');btn.disabled=true;btn.textContent='Saving...';
  try{
   const status=$('#editEqStatus').value;
   const row={name:$('#editEqName').value.trim(),category:$('#editEqCategory').value.trim()||null,description:$('#editEqDescription').value.trim()||null,daily_rate:$('#editEqDaily').value||null,weekly_rate:$('#editEqWeekly').value||null,deposit:$('#editEqDeposit').value||null,quantity:Number($('#editEqQuantity').value||1),status,available:status==='available',image_url:$('#editEqImage').value.trim()||null};
   if(!row.name)return msg('Equipment name is required.');
   const {error}=await db.from('equipment').update(row).eq('id',id);if(error)return msg(error.message);
   const files=[...($('#editEqPhotos')?.files||[])].slice(0,8);
   for(let i=0;i<files.length;i++){
    const file=files[i],ext=(file.name.split('.').pop()||'jpg').toLowerCase(),path=`${id}/${crypto.randomUUID()}.${ext}`;
    const {error:upErr}=await db.storage.from('equipment-images').upload(path,file,{upsert:false});if(upErr){msg('Changes saved, but a photo failed: '+upErr.message);continue}
    const {data:urlData}=db.storage.from('equipment-images').getPublicUrl(path),publicUrl=urlData?.publicUrl||null;
    const {error:imgErr}=await db.from('equipment_images').insert({equipment_id:id,storage_path:path,public_url:publicUrl,sort_order:i,is_cover:i===0});
    if(imgErr){console.warn(imgErr);continue}
    if(i===0&&publicUrl){await db.from('equipment_images').update({is_cover:false}).eq('equipment_id',id).neq('storage_path',path);await db.from('equipment').update({image_url:publicUrl}).eq('id',id)}
   }
   document.getElementById('editEquipmentModal')?.remove();msg('Equipment updated successfully.');await loadAdmin();
  }catch(err){console.error(err);msg('Could not update equipment: '+(err?.message||'Unknown error'))}
  finally{if(btn){btn.disabled=false;btn.textContent='Save All Changes'}}
 };
};
$('#equipmentForm').onsubmit=async e=>{
 e.preventDefault();
 const btn=e.target.querySelector('[type="submit"]');
 if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Adding...'}
 try{
   const row={
     name:$('#eqName')?.value?.trim()||'',
     category:$('#eqCategory')?.value?.trim()||null,
     description:$('#eqDescription')?.value?.trim()||null,
     image_url:$('#eqImage')?.value?.trim()||null,
     daily_rate:$('#eqDaily')?.value||null,
     weekly_rate:$('#eqWeekly')?.value||null,
     deposit:$('#eqDeposit')?.value||null
   };
   if(!row.name)return msg('Enter an equipment name.');
   const {data:created,error}=await db.from('equipment').insert(row).select().single();
   if(error)return msg(error.message);

   // If the newer photo-manager input exists, upload selected photos after creating the equipment.
   const photoInput=$('#eqPhotos');
   if(photoInput?.files?.length && created?.id){
     const files=[...photoInput.files].slice(0,8);
     for(let i=0;i<files.length;i++){
       const file=files[i];
       const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
       const path=`${created.id}/${crypto.randomUUID()}.${ext}`;
       const {error:uploadError}=await db.storage.from('equipment-images').upload(path,file,{upsert:false});
       if(uploadError){msg('Equipment added, but a photo failed to upload: '+uploadError.message);continue}
       const {data:urlData}=db.storage.from('equipment-images').getPublicUrl(path);
       const publicUrl=urlData?.publicUrl||null;
       const {error:imageError}=await db.from('equipment_images').insert({
         equipment_id:created.id,storage_path:path,public_url:publicUrl,sort_order:i,is_cover:i===0
       });
       if(imageError)msg('Equipment added, but photo record failed: '+imageError.message);
       if(i===0&&publicUrl)await db.from('equipment').update({image_url:publicUrl}).eq('id',created.id);
     }
   }
   e.target.reset();
   msg('Equipment added successfully.');
   await loadAdmin();
 }catch(err){
   console.error(err);
   msg('Could not add equipment: '+(err?.message||'Unknown error'));
 }finally{
   if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'Add Equipment'}
 }
};

function renderCalendar(){
 const rows=adminRentals.filter(x=>['contract_required','confirmed','active'].includes(x.status)).sort((a,b)=>a.start_date.localeCompare(b.start_date));
 $('#calendarList').innerHTML=rows.length?rows.map(x=>`<div class="calendar-row"><div class="calendar-date"><b>${new Date(x.start_date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</b><small>${new Date(x.start_date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})}</small></div><div><b>${esc(x.equipment?.name||'Equipment')}</b><p>${esc(x.profiles?.full_name||x.profiles?.email||'Customer')} • through ${x.end_date}</p></div><span class="status">${esc(x.status)}</span></div>`).join(''):'<div class="notice">No approved or active rentals on the calendar.</div>'
}

async function boot(){
 const {data:{session}}=await db.auth.getSession();
 $('#authView').classList.toggle('hidden',!!session);$('#customerView').classList.add('hidden');$('#adminView').classList.add('hidden');
 if(!session)return;
 if(await isAdmin()){$('#adminView').classList.remove('hidden');await loadAdmin()}else{$('#customerView').classList.remove('hidden');await loadCustomer()}
}
boot();
(function addRentalCalendarStyles(){
 if(document.getElementById('nexusRentalCalendarStyles'))return;
 const s=document.createElement('style');s.id='nexusRentalCalendarStyles';
 s.textContent=`
 .rental-form-modal{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:20px}
 .rental-form-card{position:relative;width:min(760px,100%);max-height:94vh;overflow:auto;background:#0d0d10;border:1px solid #303038;border-radius:14px;padding:30px;color:#fff;box-shadow:0 30px 100px #000}
 .rental-form-close{position:absolute;right:18px;top:12px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}.rental-form-card h2{margin:6px 0 8px}
 .equipment-availability-banner{display:flex;justify-content:space-between;align-items:center;margin:18px 0;padding:12px 14px;border:1px solid #215b3a;border-radius:8px;background:#0d2016}.equipment-availability-banner span{color:#aaa;font-size:11px;text-transform:uppercase}.equipment-availability-banner b{color:#55d98a}
 .booking-calendar{margin:16px 0;padding:16px;border:1px solid #2d2d34;border-radius:10px;background:#08080a}.booking-calendar-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.booking-calendar-head h3{margin:0}.booking-calendar-head span{color:#888;font-size:11px}.blocked-date-row{display:grid;grid-template-columns:1fr auto 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #24242a}.blocked-date-row span{color:#777}.blocked-date-row em{font-style:normal;color:#ff666e;font-size:10px;font-weight:900}.available-message{padding:12px;border:1px dashed #2d4f3b;border-radius:7px;color:#73d99b}
 .rental-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:18px 0 12px}.rental-form-card label{display:block;color:#ddd;font-size:12px;font-weight:800}.rental-form-card input,.rental-form-card textarea{width:100%;box-sizing:border-box;margin-top:7px;padding:13px;border:1px solid #36363e;border-radius:7px;background:#070709;color:#fff;font:inherit;color-scheme:dark}.rental-form-card textarea{resize:vertical}
 .date-check-message{margin:0 0 15px;padding:11px 13px;border:1px solid #333;border-radius:7px;color:#aaa;background:#0a0a0c}.date-check-message.available{border-color:#225d3c;color:#67dc94;background:#0c2015}.date-check-message.unavailable{border-color:#70272c;color:#ff777e;background:#251013}
 .rental-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:18px 0;padding:15px;border:1px solid #2b2b31;border-radius:9px;background:#09090b}.rental-summary div{display:flex;justify-content:space-between;gap:12px}.rental-summary span{color:#888}.rental-agree{display:flex!important;align-items:flex-start;gap:9px;margin:16px 0;line-height:1.45}.rental-agree input{width:auto!important;margin-top:2px!important}.rental-submit{width:100%;padding:14px!important}.rental-submit:disabled{opacity:.45;cursor:not-allowed}
 @media(max-width:620px){.rental-form-grid,.rental-summary{grid-template-columns:1fr}.blocked-date-row{grid-template-columns:1fr 1fr}.blocked-date-row span{display:none}.rental-form-card{padding:24px 15px}}
 `;
 document.head.appendChild(s);
})();

(function addClientCancelStyles(){
 if(document.getElementById('nexusClientCancelStyles'))return;
 const s=document.createElement('style');s.id='nexusClientCancelStyles';
 s.textContent=`
 .client-rental-row{position:relative;display:flex!important;justify-content:space-between;align-items:flex-start;gap:14px;padding-right:16px!important}
 .client-rental-info{min-width:0}
 .client-cancel-x{flex:0 0 32px;width:32px;height:32px;border:1px solid #6c292e;border-radius:7px;background:#211013;color:#ff656d;font-size:23px;line-height:27px;font-weight:400;cursor:pointer;transition:.18s ease}
 .client-cancel-x:hover{background:#ed1c24;border-color:#ed1c24;color:#fff;transform:scale(1.05)}
 `;
 document.head.appendChild(s);
})();

(function addRentalContractStyles(){
 if(document.getElementById('nexusContractStyles'))return;
 const s=document.createElement('style');s.id='nexusContractStyles';
 s.textContent=`
 .contract-sign-btn{display:block;margin-top:12px}.contract-signed-note{display:block;margin-top:9px;color:#67dc94}
 .contract-modal{position:fixed;inset:0;z-index:100100;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:20px}
 .contract-card{position:relative;width:min(820px,100%);max-height:94vh;overflow:auto;padding:32px;background:#0d0d10;border:1px solid #303038;border-radius:14px;color:#fff;box-shadow:0 30px 100px #000}
 .contract-close{position:absolute;right:18px;top:12px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}.contract-card h2{margin:5px 0 18px}
 .contract-warning{padding:12px 14px;border:1px solid #7a5522;border-radius:8px;background:#241b0d;color:#e9c88b;line-height:1.5}
 .contract-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}.contract-summary div{padding:13px;border:1px solid #292930;border-radius:8px;background:#08080a}.contract-summary span{display:block;color:#777;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.contract-summary b{display:block;margin-top:5px}
 .contract-terms{padding:20px;border:1px solid #292930;border-radius:9px;background:#09090b;line-height:1.65;color:#ccc}.contract-terms h3{margin-top:0;color:#fff}
 .contract-check{display:flex!important;gap:9px;align-items:flex-start;margin:20px 0;line-height:1.5}.contract-check input{width:auto!important;margin-top:3px!important}.contract-input{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px;border:1px solid #393940;border-radius:7px;background:#070709;color:#fff;font:inherit}
 .contract-esign{color:#888;font-size:12px;line-height:1.5}.contract-submit{width:100%;padding:14px!important}.signed-signature{margin:20px 0;padding:20px;border:1px solid #4b2a2d;border-radius:9px;background:#160d0f}.signed-signature span{display:block;color:#888;font-size:10px;font-weight:900;letter-spacing:.12em}.signed-signature strong{display:block;margin-top:8px;font-size:26px;font-style:italic}
 @media(max-width:620px){.contract-summary{grid-template-columns:1fr}.contract-card{padding:25px 15px}}
 `;
 document.head.appendChild(s);
})();

(function addCleanCustomerDashboardStyles(){
 if(document.getElementById('nexusCleanCustomerStyles'))return;
 const s=document.createElement('style');s.id='nexusCleanCustomerStyles';
 s.textContent=`
 .customer-account-card{display:flex;align-items:center;gap:14px;padding:4px 0 14px}.customer-avatar{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#ed1c24;color:#fff;font-size:20px;font-weight:900}.customer-account-card b,.customer-account-card span,.customer-account-card small{display:block}.customer-account-card span{margin-top:3px;color:#bbb}.customer-account-card small{margin-top:2px;color:#777}
 #customerApprovalTracker{margin:16px 0 24px}.approval-tracker{padding:22px;border:1px solid #2c2c32;border-radius:12px;background:linear-gradient(145deg,#111114,#09090b)}.approval-tracker-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.approval-tracker-head h3{margin:5px 0 0}.tracker-kicker{font-size:10px;font-weight:900;letter-spacing:.15em;color:#ed1c24}.tracker-status{padding:7px 10px;border:1px solid #5f272b;border-radius:999px;color:#ff6b72;font-size:10px;font-weight:900;letter-spacing:.08em}.tracker-line{position:relative;display:grid;grid-template-columns:repeat(3,1fr);margin:25px 0 14px}.tracker-line:before{content:"";position:absolute;top:15px;left:16.5%;right:16.5%;height:2px;background:#2e2e34}.tracker-step{position:relative;z-index:1;text-align:center;color:#777}.tracker-dot{display:grid;place-items:center;width:30px;height:30px;margin:0 auto 8px;border:2px solid #3b3b42;border-radius:50%;background:#111114;color:#777;font-size:11px;font-weight:900}.tracker-step.done{color:#ddd}.tracker-step.done .tracker-dot{border-color:#ed1c24;background:#ed1c24;color:#fff}.tracker-step.rejected .tracker-dot{background:#7d171d;border-color:#ff4c55}.tracker-step.attention .tracker-dot{background:#7b5314;border-color:#d89b32}.tracker-step b{font-size:11px}.tracker-copy{margin:0;color:#999;line-height:1.5}
 .client-rental-row{position:relative!important;display:flex!important;justify-content:space-between!important;align-items:flex-start!important;gap:16px!important;padding:16px 18px!important}.client-rental-info{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0}.client-rental-dates{color:#aaa;font-size:13px}.client-cancel-x{display:grid!important;place-items:center!important;flex:0 0 36px!important;width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;margin:0!important;border:1px solid #8b2b31!important;border-radius:8px!important;background:#281013!important;color:#ff666e!important;font-size:25px!important;line-height:1!important;font-weight:500!important;cursor:pointer!important;visibility:visible!important;opacity:1!important}.client-cancel-x:hover{background:#ed1c24!important;color:#fff!important;border-color:#ed1c24!important}.customer-empty-state{padding:18px;border:1px dashed #333;border-radius:9px;color:#777}
 @media(max-width:620px){.approval-tracker-head{flex-direction:column}.tracker-step b{font-size:9px}.client-rental-row{padding:14px!important}}
 `;
 document.head.appendChild(s);
})();

(function addCancelReservationStyles(){
 if(document.getElementById('nexusCancelReservationStyles'))return;
 const s=document.createElement('style');s.id='nexusCancelReservationStyles';
 s.textContent=`
 .cancel-reservation-btn{margin-top:10px;padding:9px 13px;border:1px solid #702a2f;border-radius:7px;background:transparent;color:#ff6b72;font-size:11px;font-weight:900;letter-spacing:.04em;cursor:pointer}.cancel-reservation-btn:hover{background:#281013;border-color:#ed1c24;color:#fff}
 .contact-nexus-note{display:block;margin-top:9px;color:#999}.cancel-reservation-modal{position:fixed;inset:0;z-index:100200;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:20px}.cancel-reservation-card{position:relative;width:min(590px,100%);padding:30px;background:#0d0d10;border:1px solid #303038;border-radius:14px;color:#fff;box-shadow:0 30px 100px #000}.cancel-modal-close{position:absolute;right:18px;top:12px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}.cancel-reservation-card h2{margin:6px 0}.cancel-summary{margin:20px 0;padding:15px;border:1px solid #2b2b31;border-radius:9px;background:#09090b}.cancel-summary div{display:flex;justify-content:space-between;gap:20px;padding:7px 0}.cancel-summary span{color:#888}.cancel-reservation-card label{display:block;color:#ddd;font-size:12px;font-weight:800}.optional{color:#777;font-weight:400}.cancel-reservation-card textarea{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:1px solid #383840;border-radius:7px;background:#070709;color:#fff;resize:vertical;font:inherit}.cancel-modal-actions{display:flex;gap:10px;margin-top:18px}.cancel-confirm-btn,.cancel-keep-btn{flex:1;padding:12px;border-radius:7px;font-weight:900;cursor:pointer}.cancel-confirm-btn{border:1px solid #ed1c24;background:#ed1c24;color:#fff}.cancel-keep-btn{border:1px solid #3a3a42;background:#151519;color:#fff}
 @media(max-width:560px){.cancel-modal-actions{flex-direction:column}.cancel-reservation-card{padding:25px 15px}}
 `;
 document.head.appendChild(s);
})();

(function addVerificationStyles(){
 if(document.getElementById('nexusVerificationStyles'))return;
 const s=document.createElement('style');s.id='nexusVerificationStyles';
 s.textContent=`
 #verificationPanel{padding:30px!important}.verification-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.verification-kicker{color:#ff2634;font-size:10px;font-weight:900;letter-spacing:.18em}.verification-head h2{margin:7px 0 0;font-size:28px}.verification-badge{padding:8px 14px;border:1px solid #a8242d;border-radius:999px;color:#ff5962;font-size:10px;font-weight:900;letter-spacing:.06em}.verification-badge.verified{border-color:#277b4d;color:#61d896}.verification-badge.under_review{border-color:#8b692b;color:#e4b955}
 .verification-form{margin-top:25px}.verification-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.verification-grid .full{grid-column:1/-1}.verification-form label{display:block;color:#aaa;font-size:11px;font-weight:800}.verification-form input,.verification-form select{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:12px;border:1px solid #303038;border-radius:7px;background:#08080a;color:#fff}.verification-form small{display:block;margin-top:4px;color:#666}.verification-consent{display:flex!important;gap:9px;align-items:flex-start;margin:20px 0!important;line-height:1.5}.verification-consent input{width:auto!important;margin:3px 0 0!important}.verification-privacy{color:#777;font-size:11px}.verification-submit{width:100%;padding:13px;border:0;border-radius:7px;background:#ed1c24;color:#fff;font-weight:900;cursor:pointer}.verification-admin-note,.verification-success{margin-top:20px;padding:16px;border:1px solid #543035;border-radius:9px;background:#170d0f}.verification-success{border-color:#245e3d;background:#0d1812}.verification-admin-note p,.verification-success p{margin-bottom:0;color:#aaa;line-height:1.5}
 @media(max-width:650px){#verificationPanel{padding:20px!important}.verification-grid{grid-template-columns:1fr}.verification-grid .full{grid-column:auto}.verification-head{flex-direction:column}}
 `;
 document.head.appendChild(s);
})();

(function(){if(document.getElementById('nexusAdminMessagingStyles'))return;const s=document.createElement('style');s.id='nexusAdminMessagingStyles';s.textContent=`
.approved-btn{border-color:#275d40!important;color:#6bdc98!important;background:#0d1c14!important;opacity:1!important}.admin-message-modal{position:fixed;inset:0;z-index:100300;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:20px}.admin-message-card{position:relative;width:min(620px,100%);padding:28px;background:#0d0d10;border:1px solid #303038;border-radius:14px;color:#fff}.admin-message-close{position:absolute;right:17px;top:10px;border:0;background:none;color:#fff;font-size:32px;cursor:pointer}.admin-message-card textarea{width:100%;box-sizing:border-box;margin:18px 0;padding:13px;border:1px solid #393940;border-radius:8px;background:#070709;color:#fff;font:inherit}.admin-message-actions{display:flex;gap:10px}.customer-admin-message{margin:14px 0 22px;padding:15px 17px;border:1px solid #33333a;border-radius:9px;background:#0c0c0f}.customer-admin-message.attention{border-color:#765521;background:#20180c}.customer-admin-message span{display:block;color:#ed1c24;font-size:10px;font-weight:900;letter-spacing:.1em}.customer-admin-message.attention span{color:#e7b24f}.customer-admin-message p{margin:7px 0 0;color:#ccc;line-height:1.55}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusCustomerProfileStyles'))return;const s=document.createElement('style');s.id='nexusCustomerProfileStyles';s.textContent=`
.customer-profile-modal{position:fixed;inset:0;z-index:100400;background:rgba(0,0,0,.92);display:flex;align-items:flex-start;justify-content:center;padding:30px 18px;overflow:auto}.customer-profile-card{position:relative;width:min(920px,100%);background:#0c0c0f;border:1px solid #303038;border-radius:16px;color:#fff;padding:28px;box-shadow:0 30px 100px #000}.profile-modal-head{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #292930;padding-bottom:18px}.profile-modal-head h2{margin:4px 0;font-size:30px}.profile-modal-head p{margin:0;color:#888}.profile-modal-close{border:0;background:none;color:#fff;font-size:34px;cursor:pointer}.profile-status-row{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.profile-status-row span{padding:8px 10px;background:#151519;border:1px solid #2e2e34;border-radius:7px;font-size:11px;text-transform:uppercase}.profile-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.profile-modal-grid section,.profile-rentals{padding:18px;border:1px solid #292930;border-radius:10px;background:#09090b}.profile-modal-grid h3,.profile-rentals h3{margin:0 0 15px}.profile-field{padding:10px 0;border-bottom:1px solid #202025}.profile-field small,.profile-field b{display:block}.profile-field small{color:#777;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.profile-field b{margin-top:4px;font-size:13px}.license-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.license-links a{color:#fff;background:#201012;border:1px solid #653037;padding:8px 10px;border-radius:6px;font-size:10px;text-decoration:none}.license-links span{color:#666;font-size:11px}.profile-note{margin-top:14px;padding:14px;border:1px solid #33333a;border-radius:8px;background:#111114}.profile-note.warning{border-color:#725523;background:#1c160c}.profile-note small{color:#888;text-transform:uppercase;font-size:9px}.profile-note p{margin:7px 0 0}.profile-rentals{margin-top:16px}.profile-rental-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #222228}.profile-rental-row:last-child{border-bottom:0}.profile-rental-row b,.profile-rental-row small{display:block}.profile-rental-row small{color:#777;margin-top:3px}.profile-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}@media(max-width:700px){.profile-modal-grid{grid-template-columns:1fr}.customer-profile-card{padding:20px}.profile-modal-head h2{font-size:24px}}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusEquipmentEditStyles'))return;const s=document.createElement('style');s.id='nexusEquipmentEditStyles';s.textContent=`
.equipment-edit-modal{position:fixed;inset:0;z-index:100500;background:rgba(0,0,0,.92);display:flex;align-items:flex-start;justify-content:center;padding:30px 18px;overflow:auto}.equipment-edit-card{position:relative;width:min(850px,100%);padding:28px;background:#0c0c0f;border:1px solid #303038;border-radius:15px;color:#fff;box-shadow:0 30px 100px #000}.equipment-edit-close{position:absolute;right:17px;top:10px;border:0;background:none;color:#fff;font-size:34px;cursor:pointer}.equipment-edit-card h2{margin:5px 0}.equipment-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}.equipment-edit-grid label{display:flex;flex-direction:column;gap:7px}.equipment-edit-grid label.wide{grid-column:1/-1}.equipment-edit-grid label>span{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8c8c94}.equipment-edit-grid input,.equipment-edit-grid textarea,.equipment-edit-grid select{box-sizing:border-box;width:100%;padding:12px;border:1px solid #37373e;border-radius:7px;background:#070709;color:#fff;font:inherit}.equipment-edit-grid small{color:#707078}.current-equipment-image{margin-top:17px;padding:12px;border:1px solid #292930;border-radius:9px}.current-equipment-image span{display:block;color:#777;font-size:9px;text-transform:uppercase;margin-bottom:8px}.current-equipment-image img{display:block;max-width:220px;max-height:140px;object-fit:cover;border-radius:6px}.equipment-edit-actions{display:flex;gap:10px;margin-top:20px}@media(max-width:650px){.equipment-edit-grid{grid-template-columns:1fr}.equipment-edit-grid label.wide{grid-column:auto}.equipment-edit-card{padding:20px}}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusProfileRentalActionStyles'))return;const s=document.createElement('style');s.id='nexusProfileRentalActionStyles';s.textContent=`.profile-rental-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.profile-rental-actions .small-btn{padding:7px 10px;font-size:9px}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusPickupReturnStyles'))return;const s=document.createElement('style');s.id='nexusPickupReturnStyles';s.textContent=`.pickup-btn{background:#b5121b!important;color:#fff!important;border-color:#ed1c24!important}.return-btn{background:#fff!important;color:#111!important;border-color:#fff!important;font-weight:900!important}.profile-rental-actions{min-width:220px}`;document.head.appendChild(s)})();


let adminContracts=[];

async function loadAdminContracts(){
 const mount=$('#contractLibrary'); if(!mount)return;
 const {data,error}=await db.from('contract_templates').select('*').order('created_at',{ascending:false});
 if(error){mount.innerHTML=`<div class="notice">Contract system needs setup: ${esc(error.message)}</div>`;return}
 adminContracts=data||[];
 renderContractLibrary();
}
function renderContractLibrary(){
 const active=adminContracts.find(x=>x.is_active);
 const summary=$('#activeContractSummary');
 if(summary)summary.innerHTML=active?`<b>${esc(active.name)}</b><br><small>Version ${esc(active.version)} • Active</small>`:'<b>No active contract.</b><br><small>Upload or activate a PDF before approving new rentals.</small>';
 const mount=$('#contractLibrary'); if(!mount)return;
 if(!adminContracts.length){mount.innerHTML='<div class="notice">No contracts uploaded yet.</div>';return}
 mount.innerHTML=`<table class="admin-table"><thead><tr><th>Contract</th><th>Version</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>${adminContracts.map(c=>`<tr>
 <td><b>${esc(c.name)}</b></td><td>${esc(c.version)}</td><td><span class="status">${c.is_active?'ACTIVE':'INACTIVE'}</span></td><td>${new Date(c.created_at).toLocaleDateString()}</td>
 <td><div class="admin-actions"><button class="small-btn" onclick="viewContractTemplate('${c.id}')">View PDF</button>${!c.is_active?`<button class="small-btn red" onclick="activateContractTemplate('${c.id}')">Make Active</button>`:''}<button class="small-btn" onclick="retireContractTemplate('${c.id}')">${c.is_active?'Deactivate':'Retire'}</button></div></td>
 </tr>`).join('')}</tbody></table>`;
}
$('#contractUploadForm') && ($('#contractUploadForm').onsubmit=async e=>{
 e.preventDefault();
 const file=$('#contractFile')?.files?.[0],name=$('#contractName')?.value.trim(),version=$('#contractVersion')?.value.trim();
 if(!file||!name||!version)return msg('Enter a name, version, and choose a PDF.');
 if(file.type!=='application/pdf')return msg('Contract must be a PDF.');
 if(file.size>15*1024*1024)return msg('PDF must be 15 MB or smaller.');
 const btn=e.target.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Uploading...';
 try{
  const path=`templates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;
  const {error:upErr}=await db.storage.from('rental-contract-templates').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(upErr)return msg(upErr.message);
  const makeActive=$('#contractMakeActive')?.checked!==false;
  if(makeActive)await db.from('contract_templates').update({is_active:false}).eq('is_active',true);
  const {error}=await db.from('contract_templates').insert({name,version,storage_path:path,is_active:makeActive});
  if(error){await db.storage.from('rental-contract-templates').remove([path]);return msg(error.message)}
  e.target.reset();$('#contractMakeActive').checked=true;msg('Contract uploaded successfully.');await loadAdminContracts();
 }finally{btn.disabled=false;btn.textContent='Upload Contract'}
});
window.viewContractTemplate=async id=>{
 const c=adminContracts.find(x=>x.id===id);if(!c)return msg('Contract not found.');
 const {data,error}=await db.storage.from('rental-contract-templates').createSignedUrl(c.storage_path,600);
 if(error)return msg(error.message);window.open(data.signedUrl,'_blank','noopener');
};
window.activateContractTemplate=async id=>{
 if(!confirm('Make this the active rental contract?'))return;
 const off=await db.from('contract_templates').update({is_active:false}).eq('is_active',true);if(off.error)return msg(off.error.message);
 const {error}=await db.from('contract_templates').update({is_active:true}).eq('id',id);if(error)return msg(error.message);
 msg('Active contract updated.');loadAdminContracts();
};
window.retireContractTemplate=async id=>{
 const c=adminContracts.find(x=>x.id===id);if(!c)return;
 if(!confirm(`${c.is_active?'Deactivate':'Retire'} this contract? Existing signed rental records will not be deleted.`))return;
 const {error}=await db.from('contract_templates').update({is_active:false}).eq('id',id);if(error)return msg(error.message);
 msg('Contract updated.');loadAdminContracts();
};

(function(){if(document.getElementById('nexusCustomerContractsStyles'))return;const s=document.createElement('style');s.id='nexusCustomerContractsStyles';s.textContent=`.profile-contracts{margin-top:16px;padding:18px;border:1px solid #292930;border-radius:10px;background:#09090b}.profile-contracts h3{margin:0}.profile-section-head{margin-bottom:14px}.customer-contract-row{display:grid;grid-template-columns:1.35fr auto 1fr auto;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid #24242a}.customer-contract-row:last-child{border-bottom:0}.contract-main b,.contract-main small,.contract-sign-details b,.contract-sign-details small{display:block}.contract-main small,.contract-sign-details small{color:#777;margin-top:3px}.contract-sign-status{font-size:10px;font-weight:900;letter-spacing:.08em;padding:8px 10px;border-radius:6px;white-space:nowrap}.contract-sign-status.signed{background:#102619;color:#75e5a0;border:1px solid #245b38}.contract-sign-status.unsigned{background:#281114;color:#ff737a;border:1px solid #6d252b}.contract-profile-actions{display:flex;gap:7px}@media(max-width:800px){.customer-contract-row{grid-template-columns:1fr}}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusCustomerSignedContractStyles'))return;const s=document.createElement('style');s.id='nexusCustomerSignedContractStyles';s.textContent=`.customer-signed-contract-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.contract-autofill-banner{margin:14px 0;padding:12px 14px;border:1px solid #245b38;background:#102619;color:#86e9aa;border-radius:8px;font-size:12px;font-weight:700}.uploaded-contract-box{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:18px 0;padding:14px;border:1px solid #35353c;background:#101013;border-radius:9px}.uploaded-contract-box b,.uploaded-contract-box small{display:block}.uploaded-contract-box small{color:#777;margin-top:4px}.signed-pdf-link{display:inline-flex!important;margin-top:18px}@media(max-width:650px){.uploaded-contract-box{align-items:flex-start;flex-direction:column}}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusContractSignErrorStyles'))return;const s=document.createElement('style');s.id='nexusContractSignErrorStyles';s.textContent=`.contract-sign-error{margin:12px 0;padding:12px 14px;border:1px solid #8b252b;background:#2a1013;color:#ff8b91;border-radius:8px}.contract-sign-error b,.contract-sign-error span{display:block}.contract-sign-error span{margin-top:5px;font-size:12px;line-height:1.45}`;document.head.appendChild(s)})();

(function(){if(document.getElementById('nexusAuditStyles'))return;const s=document.createElement('style');s.id='nexusAuditStyles';s.textContent=`.contract-audit-box{margin-top:16px;padding:15px;border:1px solid #303038;border-radius:9px;background:#09090b}.contract-audit-box h3{margin:0 0 12px}.contract-audit-box>div{padding:8px 0;border-bottom:1px solid #202025}.contract-audit-box>div:last-child{border-bottom:0}.contract-audit-box span,.contract-audit-box b{display:block}.contract-audit-box span{color:#777;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.contract-audit-box b{margin-top:3px;font-size:12px;overflow-wrap:anywhere}`;document.head.appendChild(s)})();

// Nexus contract signer build 2026-09-20.3
document.addEventListener('click',async function(e){
 const btn=e.target.closest('[data-sign-rental]');
 if(!btn)return;
 e.preventDefault();e.stopPropagation();
 const id=btn.dataset.signRental;
 let status=document.getElementById('contractClickStatus');
 if(!status){
   status=document.createElement('div');
   status.id='contractClickStatus';
   status.style.cssText='margin:10px 0;padding:10px;border:1px solid #444;border-radius:7px;font-size:12px;color:#ddd';
   btn.insertAdjacentElement('beforebegin',status);
 }
 status.textContent='Signing request started…';
 try{
   if(typeof window.signRentalContract!=='function')throw new Error('Signing function did not load.');
   await window.signRentalContract(id);
 }catch(err){
   console.error(err);
   status.textContent='Signing error: '+(err?.message||String(err));
 }
},true);


window.openAddCustomer=()=>{
 let m=document.getElementById('addCustomerModal');if(m)m.remove();
 m=document.createElement('div');m.id='addCustomerModal';m.className='admin-message-modal';
 m.innerHTML=`<div class="admin-message-card" style="max-width:650px"><button class="admin-message-close" onclick="document.getElementById('addCustomerModal').remove()">×</button><p class="nexus-kicker">NEXUS ADMIN</p><h2>Add Customer</h2><p class="muted">Create the customer account and send them an email invite to set up access.</p><div class="add-customer-grid"><label>Full Name<input id="newCustomerName" autocomplete="off"></label><label>Email<input id="newCustomerEmail" type="email" autocomplete="off"></label><label>Phone<input id="newCustomerPhone" type="tel" autocomplete="off"></label><label>Account Type<select id="newCustomerType"><option value="individual">Individual</option><option value="business">Business</option></select></label><label class="full">Business Name<input id="newCustomerBusiness" autocomplete="off" placeholder="Only if business account"></label><label class="full">Initial Status<select id="newCustomerStatus"><option value="pending">Pending Review</option><option value="approved">Approved</option></select></label></div><div id="addCustomerError" class="contract-sign-error" style="display:none"></div><div class="admin-message-actions"><button type="button" class="small-btn red" id="createCustomerBtn" onclick="createCustomerInvite()">Create Customer & Send Invite</button><button type="button" class="small-btn" onclick="document.getElementById('addCustomerModal').remove()">Cancel</button></div></div>`;
 document.body.appendChild(m);
};
window.createCustomerInvite=async()=>{
 const btn=document.getElementById('createCustomerBtn'),err=document.getElementById('addCustomerError');
 const body={full_name:document.getElementById('newCustomerName')?.value.trim(),email:document.getElementById('newCustomerEmail')?.value.trim(),phone:document.getElementById('newCustomerPhone')?.value.trim(),account_type:document.getElementById('newCustomerType')?.value,business_name:document.getElementById('newCustomerBusiness')?.value.trim(),approval_status:document.getElementById('newCustomerStatus')?.value};
 if(!body.full_name||!body.email){err.style.display='block';err.textContent='Full name and email are required.';return}
 try{
  btn.disabled=true;btn.textContent='CREATING…';err.style.display='none';
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw new Error('Admin session expired. Sign in again.');
  const r=await fetch('/api/create-customer',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`Request failed (${r.status})`);
  document.getElementById('addCustomerModal')?.remove();msg('Customer created and invite sent to '+j.email+'.');await loadAdmin();
 }catch(e){err.style.display='block';err.innerHTML='<b>Could not add customer</b><span>'+esc(e.message||String(e))+'</span>'}
 finally{if(btn){btn.disabled=false;btn.textContent='Create Customer & Send Invite'}}
};
(function(){if(document.getElementById('nexusAddCustomerStyles'))return;const st=document.createElement('style');st.id='nexusAddCustomerStyles';st.textContent=`.add-customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.add-customer-grid label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#999}.add-customer-grid input,.add-customer-grid select{display:block;width:100%;box-sizing:border-box;margin-top:7px;background:#0b0b0d;border:1px solid #333;color:#fff;padding:12px;border-radius:7px}.add-customer-grid .full{grid-column:1/-1}@media(max-width:650px){.add-customer-grid{grid-template-columns:1fr}.add-customer-grid .full{grid-column:auto}}`;document.head.appendChild(st)})();


async function loadCustomerChat(userId){
 let mount=document.getElementById('customerChatBox');
 if(!mount){
  mount=document.createElement('div');mount.id='customerChatBox';mount.className='nexus-chat-card';
  const old=document.querySelector('.admin-message-card')||document.querySelector('[class*="message-from"]');
  const host=old?.parentElement||document.querySelector('#customerStatus')?.parentElement||document.querySelector('.customer-left')||document.body;
  old?.insertAdjacentElement('afterend',mount) || host.appendChild(mount);
 }
 const {data:rows,error}=await db.from('customer_messages').select('*').eq('customer_id',userId).order('created_at',{ascending:true});
 if(error){mount.innerHTML=`<div class="chat-title">MESSAGES WITH NEXUS</div><p class="muted">${esc(error.message)}</p>`;return}
 mount.innerHTML=`<div class="chat-title">MESSAGES WITH NEXUS</div>
 <div class="chat-thread">${rows?.length?rows.map(m=>`<div class="chat-msg ${m.sender_type==='admin'?'from-admin':'from-customer'}"><div class="chat-who">${m.sender_type==='admin'?'NEXUS':'YOU'}</div><div>${esc(m.message)}</div><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join(''):'<p class="muted">No messages yet.</p>'}</div>
 <div class="chat-compose"><textarea id="customerChatInput" maxlength="2000" placeholder="Type a reply..."></textarea><button class="small-btn red" onclick="sendCustomerChat()">Send Message</button></div>`;
 const thread=mount.querySelector('.chat-thread');if(thread)thread.scrollTop=thread.scrollHeight;
 // Mark admin messages as read by customer.
 await db.from('customer_messages').update({read_by_customer:true}).eq('customer_id',userId).eq('sender_type','admin').eq('read_by_customer',false);
}
window.sendCustomerChat=async()=>{
 const input=document.getElementById('customerChatInput'),message=input?.value.trim();
 if(!message)return;
 const {data:{user}}=await db.auth.getUser();if(!user)return msg('Please sign in again.');
 const {error}=await db.from('customer_messages').insert({customer_id:user.id,sender_id:user.id,sender_type:'customer',message});
 if(error)return msg(error.message);
 input.value='';await loadCustomerChat(user.id);
};

async function loadAdminCustomerChat(customerId){
 const mount=document.getElementById('adminCustomerChat');if(!mount)return;
 const {data:rows,error}=await db.from('customer_messages').select('*').eq('customer_id',customerId).order('created_at',{ascending:true});
 if(error){mount.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}
 mount.innerHTML=`<div class="chat-thread admin-thread">${rows?.length?rows.map(m=>`<div class="chat-msg ${m.sender_type==='admin'?'from-admin':'from-customer'}"><div class="chat-who">${m.sender_type==='admin'?'NEXUS':'CUSTOMER'}</div><div>${esc(m.message)}</div><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join(''):'<p class="muted">No messages yet.</p>'}</div>
 <div class="chat-compose"><textarea id="adminChatInput" maxlength="2000" placeholder="Reply to customer..."></textarea><button class="small-btn red" onclick="sendAdminCustomerChat('${customerId}')">Send Message</button></div>`;
 const thread=mount.querySelector('.chat-thread');if(thread)thread.scrollTop=thread.scrollHeight;
 await db.from('customer_messages').update({read_by_admin:true}).eq('customer_id',customerId).eq('sender_type','customer').eq('read_by_admin',false);
}
window.sendAdminCustomerChat=async customerId=>{
 const input=document.getElementById('adminChatInput'),message=input?.value.trim();if(!message)return;
 const {data:{user}}=await db.auth.getUser();if(!user)return msg('Please sign in again.');
 const {error}=await db.from('customer_messages').insert({customer_id:customerId,sender_id:user.id,sender_type:'admin',message});
 if(error)return msg(error.message);
 input.value='';await loadAdminCustomerChat(customerId);
};

// Inject admin chat into every opened customer-profile modal without disturbing existing profile actions.


(function(){if(document.getElementById('nexusChatStyles'))return;const st=document.createElement('style');st.id='nexusChatStyles';st.textContent=`
.nexus-chat-card,.admin-chat-section{margin-top:22px;padding:16px;border:1px solid #303038;border-radius:10px;background:#0b0b0e}.chat-title{font-size:10px;font-weight:900;letter-spacing:.16em;color:#ff2733;margin-bottom:12px}.chat-thread{max-height:310px;overflow:auto;padding:5px;display:flex;flex-direction:column;gap:10px}.chat-msg{max-width:82%;padding:10px 12px;border-radius:10px;border:1px solid #333;line-height:1.4}.chat-msg.from-admin{align-self:flex-start;background:#17171b}.chat-msg.from-customer{align-self:flex-end;background:#2b1014;border-color:#6c2028}.chat-who{font-size:9px;font-weight:900;letter-spacing:.1em;color:#ff303b;margin-bottom:4px}.chat-msg small{display:block;color:#777;margin-top:6px;font-size:9px}.chat-compose{display:flex;gap:9px;margin-top:12px}.chat-compose textarea{flex:1;min-height:60px;resize:vertical;background:#09090b;color:#fff;border:1px solid #34343a;border-radius:8px;padding:10px}.admin-chat-section{margin:20px}`;
document.head.appendChild(st)})();


function renderCustomerEquipmentCatalog(items,approved){
 const mount=$('#customerEquipment');if(!mount)return;
 const categories=[...new Set(items.map(x=>x.category).filter(Boolean))];
 mount.innerHTML=`<div class="equipment-catalog-shell">
   <div class="catalog-toolbar"><div><span class="catalog-kicker">NEXUS FLEET</span><h2>Find the right equipment</h2><p>Click any piece of equipment to view photos, details, rates and rental information.</p></div>
   <div class="catalog-controls"><input id="eqCatalogSearch" type="search" placeholder="Search equipment..."><select id="eqCatalogCategory"><option value="">All equipment</option>${categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div></div>
   <div id="eqCatalogGrid" class="nexus-equipment-grid"></div></div>`;
 const draw=()=>{
   const q=($('#eqCatalogSearch')?.value||'').toLowerCase(),cat=$('#eqCatalogCategory')?.value||'';
   const rows=items.filter(x=>(!cat||x.category===cat)&&(!q||[x.name,x.category,x.description].some(v=>String(v||'').toLowerCase().includes(q))));
   $('#eqCatalogGrid').innerHTML=rows.length?rows.map(x=>eqCard(x,false,approved)).join(''):'<div class="catalog-empty">No equipment matches your search.</div>';
 };
 $('#eqCatalogSearch').oninput=draw;$('#eqCatalogCategory').onchange=draw;draw();
}
window.openEquipmentDetails=id=>{
 const x=(window.customerEquipmentCatalog||[]).find(e=>String(e.id)===String(id));if(!x)return;
 const gallery=[...(x.gallery||[])].map(i=>i.public_url).filter(Boolean);
 if(x.image_url&&!gallery.includes(x.image_url))gallery.unshift(x.image_url);
 let active=0;
 const modal=document.createElement('div');modal.className='eq-detail-overlay';modal.id='eqDetailModal';
 const photos=gallery.length?gallery:[''];
 modal.innerHTML=`<div class="eq-detail-modal"><button class="eq-modal-close" onclick="document.getElementById('eqDetailModal')?.remove()">×</button>
  <div class="eq-detail-gallery"><div class="eq-main-photo">${photos[0]?`<img id="eqMainPhoto" src="${esc(photos[0])}" alt="${esc(x.name)}">`:`<div class="eq-photo-placeholder large">NEXUS EQUIPMENT RENTALS</div>`}</div>
  ${gallery.length>1?`<div class="eq-thumbs">${gallery.map((url,i)=>`<button class="${i===0?'active':''}" onclick="setEquipmentPhoto(${i})"><img src="${esc(url)}" alt=""></button>`).join('')}</div>`:''}</div>
  <div class="eq-detail-content"><div class="eq-detail-top"><div><span class="eq-category">${esc(x.category||'Equipment')}</span><h2>${esc(x.name)}</h2></div><span class="status">${esc(x.status)}</span></div>
  <p class="eq-detail-description">${esc(x.description||'Contact Nexus Equipment Rentals for additional specifications and operating details.')}</p>
  <div class="eq-detail-rates"><div><small>DAILY RATE</small><b>${money(x.daily_rate)}</b></div><div><small>WEEKLY RATE</small><b>${money(x.weekly_rate)}</b></div><div><small>DEPOSIT</small><b>${money(x.deposit)}</b></div></div>
  <div class="eq-info-panel"><h3>Rental Information</h3><p>Availability is subject to your requested dates and Nexus approval. Submit a rental request to reserve this equipment.</p></div>
  ${x._approved&&x.status==='available'?`<button type="button" class="eq-rent-cta" data-request-equipment="${esc(x.id)}">Request This Equipment</button>`:`<div class="eq-unavailable-note">${x.status==='available'?'Your account must be approved before requesting equipment.':'This equipment is currently '+esc(x.status)+'.'}</div>`}
  </div></div>`;
 document.body.appendChild(modal);
 const requestBtn=modal.querySelector('[data-request-equipment]');
 if(requestBtn){
   requestBtn.addEventListener('click',()=>{
     modal.remove();
     window.requestRental(x.id,x.name);
   });
 }
 window.setEquipmentPhoto=i=>{active=i;const img=document.getElementById('eqMainPhoto');if(img)img.src=photos[i];modal.querySelectorAll('.eq-thumbs button').forEach((b,n)=>b.classList.toggle('active',n===i));};
 modal.onclick=e=>{if(e.target===modal)modal.remove()};
};

(function(){if(document.getElementById('nexusEquipmentCatalogStyles'))return;const st=document.createElement('style');st.id='nexusEquipmentCatalogStyles';st.textContent=`
#customerEquipment{display:block!important}.equipment-catalog-shell{margin-top:18px}.catalog-toolbar{display:flex;justify-content:space-between;gap:25px;align-items:end;margin-bottom:22px}.catalog-toolbar h2{font-size:30px;margin:5px 0}.catalog-toolbar p{color:#9a9aa2;margin:0;max-width:580px}.catalog-kicker,.eq-category{color:#ff2633;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.catalog-controls{display:flex;gap:10px}.catalog-controls input,.catalog-controls select{height:44px;background:#0c0c0f;border:1px solid #303038;color:#fff;border-radius:8px;padding:0 13px;min-width:190px}.nexus-equipment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.nexus-eq-card{background:#0d0d10;border:1px solid #2b2b31;border-radius:11px;overflow:hidden;cursor:pointer;transition:.2s}.nexus-eq-card:hover{transform:translateY(-3px);border-color:#5a2428}.nexus-eq-media{height:190px;position:relative;background:#08080a}.nexus-eq-media img{width:100%;height:100%;object-fit:cover}.eq-status{position:absolute;top:12px;left:12px}.nexus-eq-body{padding:17px}.nexus-eq-body h3{font-size:18px;margin:6px 0}.eq-desc{color:#9999a2;font-size:13px;line-height:1.5;min-height:40px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.eq-price-grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #29292e;border-bottom:1px solid #29292e;margin:15px 0}.eq-price-grid div{padding:12px 0}.eq-price-grid div+div{padding-left:15px;border-left:1px solid #29292e}.eq-price-grid small,.eq-detail-rates small{display:block;color:#777;font-size:9px;font-weight:800;letter-spacing:.1em}.eq-price-grid b{display:block;margin-top:3px}.eq-details-btn,.eq-rent-cta{width:100%;border:0;border-radius:6px;background:#f51d2a;color:#fff;font-weight:900;text-transform:uppercase;letter-spacing:.05em;padding:13px;cursor:pointer}.eq-details-btn{display:flex;justify-content:space-between}.eq-photo-placeholder{height:100%;display:grid;place-items:center;color:#555;font-weight:900;letter-spacing:.14em}.eq-detail-overlay{position:fixed;z-index:99999;inset:0;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:25px}.eq-detail-modal{width:min(1120px,96vw);max-height:92vh;overflow:auto;background:#0b0b0e;border:1px solid #34343b;border-radius:14px;display:grid;grid-template-columns:1.15fr .85fr;position:relative}.eq-modal-close{position:absolute;right:14px;top:14px;z-index:4;width:38px;height:38px;border-radius:50%;border:1px solid #444;background:#0a0a0ccc;color:#fff;font-size:24px;cursor:pointer}.eq-detail-gallery{padding:20px;background:#070709}.eq-main-photo{height:480px;border-radius:10px;overflow:hidden;background:#111}.eq-main-photo img{width:100%;height:100%;object-fit:contain}.eq-thumbs{display:flex;gap:9px;margin-top:10px;overflow:auto}.eq-thumbs button{width:90px;height:65px;padding:0;border:2px solid transparent;border-radius:6px;overflow:hidden;background:#111}.eq-thumbs button.active{border-color:#f51d2a}.eq-thumbs img{width:100%;height:100%;object-fit:cover}.eq-detail-content{padding:35px 28px}.eq-detail-top{display:flex;justify-content:space-between;gap:20px;align-items:start}.eq-detail-top h2{font-size:30px;margin:7px 0 18px}.eq-detail-description{color:#b2b2ba;line-height:1.7}.eq-detail-rates{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:22px 0}.eq-detail-rates div{border:1px solid #303038;border-radius:8px;padding:14px}.eq-detail-rates b{display:block;margin-top:6px;font-size:17px}.eq-info-panel{border-top:1px solid #2b2b31;border-bottom:1px solid #2b2b31;padding:18px 0;margin:20px 0}.eq-info-panel h3{margin:0 0 7px}.eq-info-panel p{margin:0;color:#92929a;line-height:1.5}.eq-unavailable-note{border:1px solid #513034;background:#211012;color:#ff8d94;padding:13px;border-radius:7px}.catalog-empty{grid-column:1/-1;padding:40px;text-align:center;border:1px dashed #333;color:#888;border-radius:10px}
@media(max-width:950px){.nexus-equipment-grid{grid-template-columns:repeat(2,1fr)}.eq-detail-modal{grid-template-columns:1fr}.eq-main-photo{height:330px}.catalog-toolbar{align-items:stretch;flex-direction:column}.catalog-controls{width:100%}.catalog-controls>*{flex:1}}@media(max-width:620px){.nexus-equipment-grid{grid-template-columns:1fr}.catalog-controls{flex-direction:column}.eq-detail-overlay{padding:8px}.eq-detail-content{padding:24px 16px}.eq-detail-gallery{padding:10px}.eq-main-photo{height:260px}.eq-detail-rates{grid-template-columns:1fr}.catalog-toolbar h2{font-size:24px}}`;document.head.appendChild(st)})();


// ===== NEXUS PAYMENT REQUESTS =====
async function loadMyPaymentRequests(){
 const {data:{user}}=await db.auth.getUser();if(!user)return;
 let mount=document.getElementById('customerPayments');
 if(!mount){mount=document.createElement('section');mount.id='customerPayments';mount.className='nexus-payments-card customer-checkout-center';const rentals=document.getElementById('myRentals');(rentals?.parentElement||document.getElementById('customerView'))?.appendChild(mount)}
 const {data:rows,error}=await db.from('payment_requests').select('*').eq('customer_id',user.id).order('created_at',{ascending:false});
 if(error){mount.innerHTML=`<h2>Payments</h2><p class="muted">${esc(error.message)}</p>`;return}
 const pending=(rows||[]).filter(x=>x.status==='pending'),due=pending.reduce((a,x)=>a+Number(x.amount||0),0);
 const cards=(rows||[]).map(x=>{
   const paid=x.status==='paid';
   return `<article class="customer-payment-card ${paid?'paid':''}"><div class="customer-payment-info"><div class="pay-icon">${paid?'✓':'$'}</div><div><h3>${esc(x.title||'Payment Request')}</h3><p>${esc(x.note||'Nexus Equipment Rentals')}</p>${x.due_date?`<small>Due ${esc(x.due_date)}</small>`:''}</div></div><div class="customer-payment-side"><strong>${money(x.amount)}</strong><span class="pay-state ${paid?'paid':'due'}">${paid?'✓ PAID':'PAYMENT DUE'}</span>${x.status==='pending'?`<button type="button" class="stripe-pay-btn" data-payment-id="${x.id}"><span>Pay Securely with Stripe</span><small>Secure Stripe Checkout</small></button>`:`<small class="paid-date">${x.paid_at?'Paid '+new Date(x.paid_at).toLocaleString():'Payment received'}</small>`}</div></article>`;
 }).join('');
 mount.innerHTML=`<div class="customer-pay-hero"><div><span class="payment-kicker">NEXUS SECURE PAYMENTS</span><h2>${pending.length?'Payment Required':'Payment Requests'}</h2><p>${pending.length?'Complete payment through Stripe before equipment pickup.':'Your Nexus payment history appears here.'}</p></div>${pending.length?`<div class="customer-total-due"><small>TOTAL DUE</small><b>${money(due)}</b></div>`:''}</div>${rows?.length?cards:'<div class="no-payments"><div class="pay-icon">✓</div><h3>No payment due</h3><p>There are no payment requests on your account right now.</p></div>'}`;
 mount.querySelectorAll('[data-payment-id]').forEach(btn=>btn.addEventListener('click',()=>payNexusRequest(btn.dataset.paymentId,btn)));
}
window.payNexusRequest=async(id,button)=>{
 const btn=button||null;
 if(!id){msg('Payment request is missing. Please refresh and try again.');return}
 if(btn){btn.disabled=true;btn.innerHTML='<span>Opening Stripe Checkout…</span><small>Please wait</small>'}
 try{
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session?.access_token)throw new Error('Your session expired. Please sign in again.');
  const res=await fetch('/api/create-payment-checkout',{
   method:'POST',
   headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
   body:JSON.stringify({payment_request_id:id})
  });
  const raw=await res.text();let out={};try{out=raw?JSON.parse(raw):{}}catch(_){out={error:raw||'Invalid checkout response'}}
  if(!res.ok)throw new Error(out.error||`Stripe checkout failed (${res.status}).`);
  if(!out.url)throw new Error('Stripe Checkout did not return a payment link.');
  window.location.href=out.url;
 }catch(e){
  console.error('Stripe checkout error:',e);
  const detail=e?.message||'Could not open Stripe Checkout.';
  msg(detail);
  let box=document.getElementById('stripeCheckoutError');
  if(!box){box=document.createElement('div');box.id='stripeCheckoutError';box.className='stripe-checkout-error';btn?.insertAdjacentElement('afterend',box)}
  if(box)box.innerHTML=`<b>Payment could not open</b><span>${esc(detail)}</span>`;
  if(btn){btn.disabled=false;btn.innerHTML='<span>Pay Securely with Stripe</span><small>Secure Stripe Checkout</small>'}
 }
};

window.openPaymentRequest=async(customerId,rentalId='')=>{
 const customer=(adminCustomers||[]).find(x=>String(x.id)===String(customerId));
 const rental=(adminRentals||[]).find(x=>String(x.id)===String(rentalId));
 const modal=document.createElement('div');modal.className='eq-detail-overlay';modal.id='paymentRequestModal';
 modal.innerHTML=`<div class="payment-modal"><button class="eq-modal-close" onclick="document.getElementById('paymentRequestModal')?.remove()">×</button><span class="payment-kicker">NEXUS PAYMENTS</span><h2>Send Payment Request</h2><p class="muted">${esc(customer?.full_name||customer?.email||'Customer')}</p>
 <label>Payment For<select id="payTitle"><option>Rental Deposit</option><option>Rental Balance</option><option>Damage / Fees</option><option>Custom Payment</option></select></label>
 <label>Amount ($)<input id="payAmount" type="number" min=".50" step=".01" placeholder="1000.00"></label>
 <label>Due Date<input id="payDue" type="date"></label>
 <label>Note<textarea id="payNote" maxlength="1000" placeholder="Add payment details for the customer..."></textarea></label>
 <button class="eq-rent-cta" id="sendPaymentRequestBtn">Create & Send Payment Request</button></div>`;
 document.body.appendChild(modal);
 modal.querySelector('#sendPaymentRequestBtn').onclick=async()=>{
  const amount=Number($('#payAmount').value),title=$('#payTitle').value,note=$('#payNote').value.trim(),due_date=$('#payDue').value||null;
  if(!amount||amount<.5)return msg('Enter a valid payment amount.');
  const {data:{user}}=await db.auth.getUser();
  const {error}=await db.from('payment_requests').insert({customer_id:customerId,rental_request_id:rentalId||null,title,amount,note:note||null,due_date,status:'pending',created_by:user.id});
  if(error)return msg(error.message);
  modal.remove();msg('Payment request sent to customer.');loadAdminPaymentRequests();
 };
};
async function loadAdminPaymentRequests(){
 let mount=document.getElementById('adminPaymentRequests');
 if(!mount){mount=document.createElement('section');mount.id='adminPaymentRequests';mount.className='nexus-payments-card';document.getElementById('adminView')?.appendChild(mount)}
 const {data:rows,error}=await db.from('payment_requests').select('*').order('created_at',{ascending:false}).limit(100);
 if(error){mount.innerHTML='';return}
 const unread=(rows||[]).filter(x=>x.status==='paid'&&!x.admin_seen_at);
 mount.innerHTML=`<div class="payment-head"><div><span class="payment-kicker">PAYMENT ACTIVITY</span><h2>Payment Requests ${unread.length?`<span class="payment-badge">${unread.length} NEW</span>`:''}</h2></div>${unread.length?`<button class="small-btn" onclick="markPaymentsSeen()">Mark payments seen</button>`:''}</div>
 ${unread.map(x=>{const c=adminCustomers.find(c=>c.id===x.customer_id);return `<div class="payment-received-alert"><b>✓ PAYMENT RECEIVED — ${money(x.amount)}</b><span>${esc(c?.full_name||c?.email||'Customer')} • ${esc(x.title)} • ${x.paid_at?new Date(x.paid_at).toLocaleString():''}</span></div>`}).join('')}
 ${rows?.length?rows.map(x=>{const c=adminCustomers.find(c=>c.id===x.customer_id);return `<div class="payment-row"><div><b>${esc(c?.full_name||c?.email||'Customer')}</b><small>${esc(x.title)}</small>${x.paid_at?`<small>Paid ${new Date(x.paid_at).toLocaleString()}</small>`:''}</div><div class="payment-amount">${money(x.amount)}</div><span class="status ${x.status==='paid'?'paid-status':''}">${esc(x.status)}</span></div>`}).join(''):'<p class="muted">No payment requests yet.</p>'}`;
}
window.markPaymentsSeen=async()=>{
 const {error}=await db.from('payment_requests').update({admin_seen_at:new Date().toISOString()}).eq('status','paid').is('admin_seen_at',null);
 if(error)return msg(error.message);loadAdminPaymentRequests();
};
document.addEventListener('click',e=>{
 const b=e.target.closest('[onclick*="openCustomerProfile"]');if(!b)return;
 setTimeout(()=>{
   const m=(b.getAttribute('onclick')||'').match(/openCustomerProfile\(['"]([^'"]+)/);if(!m)return;
   const customerId=m[1];
   const modal=[...document.querySelectorAll('.modal,.modal-card,.modal-content')].find(x=>x.offsetParent!==null);if(!modal||modal.querySelector('.send-payment-profile'))return;
   const btn=document.createElement('button');btn.className='small-btn red send-payment-profile';btn.textContent='Send Payment Request';btn.onclick=()=>openPaymentRequest(customerId);modal.appendChild(btn);
 },400);
},true);
(function(){const st=document.createElement('style');st.textContent=`.nexus-payments-card{margin-top:24px;padding:20px;border:1px solid #303038;border-radius:11px;background:#0b0b0e}.payment-kicker{font-size:10px;font-weight:900;letter-spacing:.15em;color:#ff2633}.payment-row{display:grid;grid-template-columns:minmax(180px,1fr) auto auto auto;gap:14px;align-items:center;padding:14px 0;border-top:1px solid #29292f}.payment-row small{display:block;color:#888;margin-top:4px}.payment-amount{font-size:18px;font-weight:900}.payment-modal{width:min(560px,94vw);background:#0c0c0f;border:1px solid #34343a;border-radius:13px;padding:28px;position:relative}.payment-modal label{display:block;margin:14px 0;font-weight:700}.payment-modal input,.payment-modal select,.payment-modal textarea{width:100%;box-sizing:border-box;margin-top:7px;background:#08080a;color:#fff;border:1px solid #34343a;border-radius:7px;padding:12px}.payment-modal textarea{min-height:90px}@media(max-width:650px){.payment-row{grid-template-columns:1fr auto}.payment-row button{grid-column:1/-1}}`;document.head.appendChild(st)})();


// Reliable Admin -> Customer Profile payment button.
// Wraps openCustomerProfile itself instead of trying to guess which modal was clicked.
(function installPaymentProfileButton(){
 const original=window.openCustomerProfile;
 if(typeof original!=='function')return;
 window.openCustomerProfile=async function(customerId,...args){
   const result=await original.call(this,customerId,...args);
   setTimeout(()=>{
     const visible=[...document.querySelectorAll('.modal,.modal-card,.modal-content,[role="dialog"]')].filter(x=>x.offsetParent!==null);
     const host=visible[visible.length-1]||document.querySelector('.modal:not(.hidden)')||document.body;
     if(host.querySelector?.('.send-payment-profile'))return;
     const section=document.createElement('div');
     section.className='profile-payment-action';
     section.innerHTML=`<div><span class="payment-kicker">NEXUS PAYMENTS</span><h3>Collect Payment</h3><p>Send this customer a secure online payment request.</p></div><button type="button" class="small-btn red send-payment-profile">Send Payment Request</button>`;
     section.querySelector('button').addEventListener('click',()=>window.openPaymentRequest(customerId));
     host.appendChild(section);
   },250);
   return result;
 };
})();
(function(){const st=document.createElement('style');st.textContent=`.profile-payment-action{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:22px 0 4px;padding:17px;border:1px solid #4a2529;border-radius:9px;background:linear-gradient(135deg,#160d0f,#0c0c0f)}.profile-payment-action h3{margin:4px 0}.profile-payment-action p{margin:0;color:#8e8e96;font-size:12px}@media(max-width:600px){.profile-payment-action{align-items:stretch;flex-direction:column}.profile-payment-action button{width:100%}}`;document.head.appendChild(st)})();

(function(){const st=document.createElement('style');st.textContent=`.payment-head{display:flex;align-items:center;justify-content:space-between;gap:15px}.payment-badge{display:inline-block;background:#ef202c;color:#fff;font-size:9px;vertical-align:middle;padding:5px 8px;border-radius:999px;margin-left:8px}.payment-received-alert{display:flex;justify-content:space-between;gap:15px;padding:14px 16px;margin:10px 0;border:1px solid #28663b;background:#0c2113;border-radius:8px}.payment-received-alert b{color:#65df89}.payment-received-alert span{color:#b9c7bd;font-size:12px}.paid-status{border-color:#28663b!important;color:#65df89!important}@media(max-width:650px){.payment-head,.payment-received-alert{align-items:stretch;flex-direction:column}}`;document.head.appendChild(st)})();


// ===== NEXUS PAYMENT CENTER: deterministic admin UI =====
function ensureAdminPaymentCenter(){
 const admin=document.getElementById('adminView');if(!admin)return;
 let center=document.getElementById('nexusPaymentCenter');
 if(!center){
  center=document.createElement('section');center.id='nexusPaymentCenter';center.className='nexus-payments-card payment-center-main';
  const firstPanel=admin.querySelector('.admin-panel')||admin.firstElementChild;
  firstPanel?.insertAdjacentElement('afterend',center) || admin.appendChild(center);
 }
 refreshPaymentCenter();
}
async function refreshPaymentCenter(){
 const center=document.getElementById('nexusPaymentCenter');if(!center)return;
 const {data:rows,error}=await db.from('payment_requests').select('*').order('created_at',{ascending:false}).limit(100);
 if(error){center.innerHTML=`<span class="payment-kicker">NEXUS PAYMENTS</span><h2>Payment Center</h2><div class="payment-system-error"><b>Payment system not connected</b><p>${esc(error.message)}</p></div>`;return}
 const unread=(rows||[]).filter(x=>x.status==='paid'&&!x.admin_seen_at);
 const paid=(rows||[]).filter(x=>x.status==='paid');
 const pending=(rows||[]).filter(x=>x.status==='pending');
 center.innerHTML=`<div class="payment-center-head"><div><span class="payment-kicker">NEXUS PAYMENTS</span><h2>Payment Center ${unread.length?`<span class="payment-badge">${unread.length} NEW</span>`:''}</h2><p>Stripe-confirmed payments are detected automatically.</p></div><button class="small-btn" onclick="refreshPaymentCenter()">Refresh Payments</button></div>
 <div class="payment-center-stats"><div><small>PENDING</small><b>${pending.length}</b></div><div><small>PAID</small><b>${paid.length}</b></div><div><small>COLLECTED</small><b>${money(paid.reduce((a,x)=>a+Number(x.amount||0),0))}</b></div></div>
 ${unread.map(x=>{const c=adminCustomers.find(c=>c.id===x.customer_id);return `<div class="payment-received-alert"><b>✓ PAYMENT RECEIVED — ${money(x.amount)}</b><span>${esc(c?.full_name||c?.email||'Customer')} • ${esc(x.title)}${x.paid_at?' • '+new Date(x.paid_at).toLocaleString():''}</span></div>`}).join('')}
 <div class="payment-center-list">${rows?.length?rows.map(x=>{const c=adminCustomers.find(c=>c.id===x.customer_id);return `<div class="payment-row"><div><b>${esc(c?.full_name||c?.email||'Customer')}</b><small>${esc(x.title||'Payment Request')}</small></div><div class="payment-amount">${money(x.amount)}</div><span class="status ${x.status==='paid'?'paid-status':''}">${esc(x.status)}</span></div>`}).join(''):'<p class="muted">No payment requests yet. Open a customer profile and click Send Payment Request.</p>'}</div>`;
}
window.refreshPaymentCenter=refreshPaymentCenter;

// Run after admin dashboard data has rendered, and poll Stripe-confirmed DB state every 20 sec.
setInterval(()=>{if(document.getElementById('adminView')&&!document.getElementById('adminView').classList.contains('hidden'))refreshPaymentCenter()},20000);
(function(){const st=document.createElement('style');st.textContent=`.payment-center-main{margin:22px 0!important}.payment-center-head{display:flex;justify-content:space-between;align-items:center;gap:18px}.payment-center-head h2{margin:5px 0}.payment-center-head p{margin:0;color:#888}.payment-center-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.payment-center-stats div{padding:15px;border:1px solid #303038;border-radius:8px;background:#08080a}.payment-center-stats small{display:block;color:#777;font-size:9px;font-weight:900;letter-spacing:.12em}.payment-center-stats b{display:block;margin-top:5px;font-size:20px}.payment-system-error{border:1px solid #6e2c33;background:#241014;padding:15px;border-radius:8px}.payment-system-error b{color:#ff6e77}.payment-system-error p{margin:7px 0 0;color:#bbb}@media(max-width:650px){.payment-center-head{align-items:stretch;flex-direction:column}.payment-center-stats{grid-template-columns:1fr}}`;document.head.appendChild(st)})();


// ===== ADMIN PAYMENTS TAB + CUSTOMER PROFILE PAYMENT STATUS =====
async function loadCustomerPaymentStatus(customerId){
 const mount=document.getElementById(`profilePaymentStatus-${customerId}`);if(!mount)return;
 const {data:rows,error}=await db.from('payment_requests').select('*').eq('customer_id',customerId).order('created_at',{ascending:false});
 if(error){mount.innerHTML=`<span class="payment-kicker">PAYMENT STATUS</span><b class="pay-error">Unable to load</b>`;return}
 const pending=(rows||[]).filter(x=>x.status==='pending'),paid=(rows||[]).filter(x=>x.status==='paid');
 const due=pending.reduce((a,x)=>a+Number(x.amount||0),0),collected=paid.reduce((a,x)=>a+Number(x.amount||0),0);
 const overall=pending.length?'NOT PAID':paid.length?'PAID':'NO PAYMENT REQUEST';
 mount.className=`profile-payment-status ${pending.length?'not-paid':paid.length?'is-paid':'no-payment'}`;
 mount.innerHTML=`<div><span class="payment-kicker">PAYMENT STATUS</span><b>${overall}</b></div><div class="profile-pay-money"><span>Amount Due <b>${money(due)}</b></span><span>Paid <b>${money(collected)}</b></span></div>
 ${rows?.length?`<div class="profile-pay-history">${rows.slice(0,5).map(x=>`<div><span>${esc(x.title)}</span><b>${money(x.amount)}</b><em class="${x.status==='paid'?'paid':'unpaid'}">${x.status==='paid'?'PAID':'NOT PAID'}</em></div>`).join('')}</div>`:''}`;
}

function installPaymentsAdminTab(){
 const admin=document.getElementById('adminView');if(!admin||document.getElementById('tab-payments'))return;
 const tabbar=admin.querySelector('.admin-tabs');
 if(!tabbar)return;
 const btn=document.createElement('button');btn.className='admin-tab';btn.dataset.tab='payments';btn.innerHTML=`Payments <span id="paymentsBadge" class="badge"></span>`;
 tabbar.appendChild(btn);
 const panel=document.createElement('section');panel.id='tab-payments';panel.className='admin-panel';
 panel.innerHTML=`<div class="payments-tab-head"><div><p class="nexus-kicker">NEXUS PAYMENTS</p><h2>Payments</h2><p>See who has paid, who still owes, and every payment request.</p></div><button class="small-btn" onclick="renderPaymentsTab()">Refresh</button></div>
 <div id="paymentsTabStats" class="payment-center-stats"></div>
 <div class="payments-filters"><button class="pay-filter active" data-pay-filter="all">All</button><button class="pay-filter" data-pay-filter="pending">Not Paid</button><button class="pay-filter" data-pay-filter="paid">Paid</button></div>
 <div id="paymentsTabTable"></div>`;
 const panels=admin.querySelectorAll('.admin-panel');(panels[panels.length-1]||tabbar).insertAdjacentElement('afterend',panel);
 btn.onclick=()=>{$$('.admin-tab').forEach(x=>x.classList.remove('active'));$$('.admin-panel').forEach(x=>x.classList.remove('active'));btn.classList.add('active');panel.classList.add('active');renderPaymentsTab()};
 panel.querySelectorAll('.pay-filter').forEach(b=>b.onclick=()=>{panel.querySelectorAll('.pay-filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderPaymentsTab(b.dataset.payFilter)});
 renderPaymentsTab();
}
window.renderPaymentsTab=async(filter)=>{
 const mount=document.getElementById('paymentsTabTable');if(!mount)return;
 if(!filter)filter=document.querySelector('.pay-filter.active')?.dataset.payFilter||'all';
 const {data:rows,error}=await db.from('payment_requests').select('*').order('created_at',{ascending:false});
 if(error){mount.innerHTML=`<div class="payment-system-error"><b>Could not load payments</b><p>${esc(error.message)}</p></div>`;return}
 const pending=(rows||[]).filter(x=>x.status==='pending'),paid=(rows||[]).filter(x=>x.status==='paid');
 const due=pending.reduce((a,x)=>a+Number(x.amount||0),0),collected=paid.reduce((a,x)=>a+Number(x.amount||0),0);
 const stats=document.getElementById('paymentsTabStats');if(stats)stats.innerHTML=`<div><small>NOT PAID</small><b>${pending.length}</b></div><div><small>PAID</small><b>${paid.length}</b></div><div><small>OUTSTANDING</small><b>${money(due)}</b></div><div><small>COLLECTED</small><b>${money(collected)}</b></div>`;
 const badge=document.getElementById('paymentsBadge');if(badge)badge.textContent=pending.length||'';
 const filtered=(rows||[]).filter(x=>filter==='all'||x.status===filter);
 mount.innerHTML=filtered.length?`<div class="payments-table-wrap"><table class="admin-table payments-table"><thead><tr><th>Customer</th><th>Payment For</th><th>Amount</th><th>Due</th><th>Status</th><th>Paid</th><th>Actions</th></tr></thead><tbody>${filtered.map(x=>{const c=adminCustomers.find(c=>c.id===x.customer_id);return `<tr><td><b>${esc(c?.full_name||'Customer')}</b><small>${esc(c?.email||'')}</small></td><td>${esc(x.title||'Payment Request')}<small>${esc(x.note||'')}</small></td><td><b>${money(x.amount)}</b></td><td>${esc(x.due_date||'—')}</td><td><span class="pay-table-status ${x.status==='paid'?'paid':'unpaid'}">${x.status==='paid'?'✓ PAID':'NOT PAID'}</span></td><td>${x.paid_at?new Date(x.paid_at).toLocaleString():'—'}</td><td><button class="small-btn" onclick="openCustomerProfile('${x.customer_id}')">View Customer</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="notice">No payments in this category.</div>';
};

(function(){
 const oldLoadAdmin=window.loadAdmin;
 // loadAdmin is lexical in this app, so install when admin UI becomes visible instead.
 const observer=new MutationObserver(()=>{const a=document.getElementById('adminView');if(a&&!a.classList.contains('hidden'))installPaymentsAdminTab()});
 observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
 setTimeout(installPaymentsAdminTab,500);
 const st=document.createElement('style');st.textContent=`.profile-payment-status{margin:14px 0 20px;padding:15px 17px;border:1px solid #333;border-radius:9px;background:#0b0b0e;display:flex;justify-content:space-between;gap:20px;align-items:center}.profile-payment-status>div:first-child b{display:block;margin-top:5px;font-size:18px}.profile-payment-status.is-paid{border-color:#27663a;background:#0b1c11}.profile-payment-status.is-paid>div:first-child b{color:#65df89}.profile-payment-status.not-paid{border-color:#752c34;background:#211013}.profile-payment-status.not-paid>div:first-child b{color:#ff7079}.profile-pay-money{display:flex;gap:18px}.profile-pay-money span{color:#888;font-size:10px}.profile-pay-money b{display:block;color:#fff;font-size:15px;margin-top:3px}.profile-pay-history{width:100%;border-top:1px solid #333;padding-top:10px}.profile-pay-history>div{display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:6px 0}.profile-pay-history em,.pay-table-status{font-style:normal;font-size:9px;font-weight:900;padding:4px 7px;border-radius:99px}.profile-pay-history .paid,.pay-table-status.paid{color:#65df89;background:#10351c}.profile-pay-history .unpaid,.pay-table-status.unpaid{color:#ff727a;background:#3a1418}.payments-tab-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.payments-tab-head h2{font-size:30px;margin:4px 0}.payments-tab-head p{margin:0;color:#888}.payments-filters{display:flex;gap:8px;margin:18px 0}.pay-filter{background:#101014;color:#aaa;border:1px solid #303038;padding:9px 14px;border-radius:7px;cursor:pointer;font-weight:800}.pay-filter.active{background:#e91e2b;color:#fff;border-color:#e91e2b}.payments-table-wrap{overflow:auto}.payments-table td small{display:block;color:#777;margin-top:4px}.payment-center-stats{grid-template-columns:repeat(4,1fr)!important}@media(max-width:700px){.profile-payment-status,.payments-tab-head{align-items:stretch;flex-direction:column}.profile-pay-money{justify-content:space-between}.payment-center-stats{grid-template-columns:repeat(2,1fr)!important}}`;document.head.appendChild(st);
})();

(function(){const st=document.createElement('style');st.textContent=`.customer-checkout-center{padding:26px!important}.customer-pay-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding-bottom:20px}.customer-pay-hero h2{font-size:30px;margin:5px 0}.customer-pay-hero p{margin:0;color:#999}.customer-total-due{text-align:right}.customer-total-due small{display:block;color:#777;font-size:9px;font-weight:900}.customer-total-due b{font-size:30px}.customer-payment-card{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:20px;margin-top:12px;border:1px solid #3c282b;border-radius:11px;background:#100c0e}.customer-payment-card.paid{border-color:#244d30;background:#0b130e}.customer-payment-info{display:flex;gap:14px;align-items:center}.pay-icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#e71f2c;color:#fff;font-weight:900;font-size:18px;flex:none}.customer-payment-card.paid .pay-icon,.no-payments .pay-icon{background:#176b36}.customer-payment-info h3{margin:0 0 5px}.customer-payment-info p,.customer-payment-info small{margin:0;color:#888}.customer-payment-side{text-align:right;min-width:230px}.customer-payment-side>strong{display:block;font-size:24px}.pay-state{display:inline-block;margin:5px 0 10px;padding:4px 8px;border-radius:999px;font-size:9px;font-weight:900}.pay-state.due{background:#3c1519;color:#ff747c}.pay-state.paid{background:#11391e;color:#66dc89}.stripe-pay-btn{width:100%;border:0;border-radius:8px;background:#e91f2c;color:#fff;padding:12px 16px;font-weight:900;cursor:pointer}.stripe-pay-btn span,.stripe-pay-btn small{display:block}.stripe-pay-btn small{margin-top:3px;color:#ffdadd;font-size:9px}.paid-date{display:block;color:#7c9a84}.no-payments{text-align:center;padding:32px 10px}.no-payments .pay-icon{margin:0 auto 12px}.no-payments p{color:#888}@media(max-width:650px){.customer-pay-hero,.customer-payment-card{align-items:stretch;flex-direction:column}.customer-total-due,.customer-payment-side{text-align:left;min-width:0}}`;document.head.appendChild(st)})();

(function(){const st=document.createElement('style');st.textContent=`.stripe-checkout-error{margin-top:10px;padding:11px 13px;border:1px solid #6b242a;background:#241014;border-radius:7px;color:#ff9da3;text-align:left}.stripe-checkout-error b,.stripe-checkout-error span{display:block}.stripe-checkout-error span{font-size:11px;margin-top:4px}`;document.head.appendChild(st)})();

(function(){const st=document.createElement('style');st.textContent=`
.nexus-notification-center{margin:18px 0;padding:20px;border:1px solid #30262a;border-radius:14px;background:linear-gradient(145deg,#0b0b0d,#111114);color:#fff}.nnc-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.nnc-head h3{margin:3px 0 5px;font-size:22px}.nnc-head p{margin:0;color:#aaa;font-size:13px}.nnc-kicker{color:#ff2638;font-size:10px;font-weight:900;letter-spacing:1.5px}.nnc-saved{color:#60d394;font-size:12px;font-weight:800}.nnc-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.nnc-grid label>span,.nnc-label{display:block;color:#aaa;font-size:10px;font-weight:800;text-transform:uppercase;margin-bottom:7px}.nnc-grid input{width:100%;box-sizing:border-box;background:#09090b;border:1px solid #333;color:#fff;padding:11px;border-radius:8px}.nnc-push,.nnc-save{background:#ed1c2b;color:#fff;border:0;border-radius:8px;padding:11px 15px;font-weight:900;cursor:pointer}.nnc-grid small{display:block;margin-top:7px;color:#888}.nnc-section{border-top:1px solid #29292d;margin-top:18px;padding-top:15px}.nnc-section>b{display:block;margin-bottom:10px}.nnc-events{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.nnc-check{display:inline-flex;align-items:center;gap:8px;margin-right:16px;color:#ddd;font-size:13px}.nnc-check input{accent-color:#ed1c2b}.nnc-actions{display:flex;gap:10px;margin-top:18px}.nnc-test{background:#18181c;color:#fff;border:1px solid #3a3a40;border-radius:8px;padding:11px 15px;font-weight:800;cursor:pointer}@media(max-width:700px){.nnc-grid,.nnc-events{grid-template-columns:1fr}.nnc-actions{flex-direction:column}}
`;document.head.appendChild(st)})();