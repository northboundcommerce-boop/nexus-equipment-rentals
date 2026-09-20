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
 await loadVerification();

 await loadCustomerEquipment(status==='approved');
 const {data:r,error}=await db.from('rental_requests').select('id,start_date,end_date,status,equipment(name)').eq('customer_id',user.id).order('created_at',{ascending:false});
 if(error){msg(error.message);return}
 $('#myRentals').innerHTML=r?.length?r.map(x=>{
   const cancellable=['pending','approved','contract_required','confirmed'].includes(x.status);
   const action=x.status==='contract_required'
     ? `<button class="small-btn red contract-sign-btn" onclick="openRentalContract('${x.id}')">Review & Sign Contract</button>`
     : x.status==='confirmed'
       ? `<small class="contract-signed-note">✓ Contract signed — rental confirmed</small>`:'';
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
 const {data}=await db.from('equipment').select('*').neq('status','inactive').order('created_at',{ascending:false});
 $('#customerEquipment').innerHTML=data?.length?data.map(x=>eqCard(x,false,approved)).join(''):'<div class="equipment-item">No equipment added yet.</div>'
}
function eqCard(x,admin=false,approved=false){
 return `<div class="equipment-item">${x.image_url?`<img src="${esc(x.image_url)}" alt="" class="eq-img">`:''}<span class="status">${esc(x.status)}</span><h3>${esc(x.name)}</h3><p class="muted">${esc(x.category||'Equipment')}</p><p>${esc(x.description||'')}</p><div class="rate-row"><b>${money(x.daily_rate)}/day</b><span>${money(x.weekly_rate)}/week</span></div>${admin?`<div class="admin-actions"><button class="small-btn" onclick="editEq('${x.id}')">Edit</button><button class="small-btn" onclick="setEq('${x.id}','available')">Available</button><button class="small-btn" onclick="setEq('${x.id}','maintenance')">Maintenance</button><button class="small-btn red" onclick="removeEq('${x.id}')">Remove</button></div>`:(approved&&x.status==='available'?`<button class="small-btn red" onclick="requestRental('${x.id}','${esc(x.name)}')">Request Rental</button>`:'')}</div>`
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
   const {error}=await db.from('rental_requests').insert({customer_id:user.id,equipment_id:id,start_date:startDate,end_date:endDate,customer_notes:notes||null});
   if(error){btn.disabled=false;btn.textContent='Submit Rental Request';return msg(error.message)}
   modal.remove();msg('Rental request submitted to Nexus for approval.');loadCustomer();
 };
};

async function loadAdmin(){
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

 renderStats(); renderCustomers(); renderRentals(); renderEquipment(); renderCalendar();
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

  <section class="profile-rentals"><h3>Rental History</h3>
   ${rentals.length?rentals.map(r=>{const e=equipmentMap[r.equipment_id];return `<div class="profile-rental-row"><div><b>${esc(e?.name||'Equipment')}</b><small>${esc(r.start_date||'—')} → ${esc(r.end_date||'—')}</small></div><div class="profile-rental-actions">
 <span class="status">${esc((r.status||'pending').replaceAll('_',' '))}</span>
 ${['approved','contract_required','confirmed'].includes(r.status)?`<button class="small-btn red pickup-btn" onclick="markRentalPickedUpFromProfile('${r.id}','${id}')">✓ Picked Up</button>`:''}
 ${r.status==='active'?`<button class="small-btn return-btn" onclick="markRentalReturnedFromProfile('${r.id}','${id}')">↩ Return Equipment</button>`:''}
 ${r.status==='completed'?`<button class="small-btn approved-btn" disabled>✓ Returned</button>`:''}
</div></div>`}).join(''):'<p class="muted">No rental requests yet.</p>'}
  </section>

  <div class="profile-modal-actions">
   ${status!=='approved'?`<button class="small-btn red" onclick="setCustomer('${id}','approved');document.getElementById('customerProfileModal')?.remove()">Approve Account</button>`:'<button class="small-btn approved-btn" disabled>✓ Account Approved</button>'}
   <button class="small-btn" onclick="document.getElementById('customerProfileModal')?.remove();openMoreInfoMessage('${id}')">More Info</button>
   <button class="small-btn" onclick="document.getElementById('customerProfileModal')?.remove();openCustomerMessage('${id}')">Send Message</button>
   ${verification?.status!=='verified'?`<button class="small-btn" onclick="verifyCustomerIdentity('${id}')">Verify Identity</button>`:'<button class="small-btn approved-btn" disabled>✓ Identity Verified</button>'}
  </div>
 </div>`;
};


window.markRentalPickedUpFromProfile=async(rentalId,customerId)=>{
 const rental=adminRentals.find(x=>x.id===rentalId);
 if(!rental)return msg('Rental not found.');
 if(!['approved','contract_required','confirmed'].includes(rental.status))return msg('This rental cannot be marked picked up from its current status.');
 if(!confirm('Confirm the customer has PICKED UP this equipment? This will mark the rental Active.'))return;
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
    ${['approved','contract_required','confirmed'].includes(x.status)?`<button class="small-btn red" onclick="adminMarkPickedUp('${x.id}')">✓ Picked Up</button>`:''}
    ${x.status==='confirmed'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">View Contract</button>`:''}
    ${x.status==='active'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">View Contract</button><button class="small-btn red return-btn" onclick="adminMarkReturned('${x.id}')">↩ Return Equipment</button>`:''}
    ${x.status==='completed'?`<button class="small-btn approved-btn" disabled>✓ Returned</button>`:''}
    ${['pending','approved','contract_required','confirmed'].includes(x.status)?`<button class="small-btn" onclick="setRental('${x.id}','rejected')">Reject</button>`:''}
  </div></td>
 </tr>`).join('')}</tbody></table>`;
}


window.adminMarkPickedUp=async id=>{
 const r=adminRentals.find(x=>x.id===id);if(!r)return msg('Rental not found.');
 if(!confirm('Confirm this equipment was PICKED UP?'))return;
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
 if(error)return msg(error.message);
 if(!r)return msg('Rental request not found.');
 if(r.status!=='contract_required')return msg('This rental is not awaiting a contract.');

 const [{data:p},{data:eq}]=await Promise.all([
   db.from('profiles').select('*').eq('id',user.id).maybeSingle(),
   db.from('equipment').select('*').eq('id',r.equipment_id).maybeSingle()
 ]);
 let modal=document.getElementById('rentalContractModal');
 if(!modal){modal=document.createElement('div');modal.id='rentalContractModal';document.body.appendChild(modal)}
 modal.className='contract-modal';
 modal.innerHTML=`<div class="contract-card">
  <button class="contract-close" onclick="document.getElementById('rentalContractModal').remove()">×</button>
  <p class="nexus-kicker">NEXUS EQUIPMENT RENTALS</p>
  <h2>Equipment Rental Agreement</h2>
  <p class="contract-warning"><b>Contract template:</b> Nexus should have its attorney review/replace the legal terms below before relying on this agreement in production.</p>

  <div class="contract-summary">
   <div><span>Customer</span><b>${esc(p?.full_name||user.email)}</b></div>
   <div><span>Equipment</span><b>${esc(eq?.name||'Equipment')}</b></div>
   <div><span>Rental Period</span><b>${esc(r.start_date)} → ${esc(r.end_date)}</b></div>
   <div><span>Daily Rate</span><b>${money(eq?.daily_rate)}</b></div>
   <div><span>Weekly Rate</span><b>${money(eq?.weekly_rate)}</b></div>
   <div><span>Deposit</span><b>${money(eq?.deposit)}</b></div>
  </div>

  <div class="contract-terms">
   <h3>Rental Terms</h3>
   <p>Customer agrees to use the equipment only for lawful and intended purposes, to exercise reasonable care, and to return it by the agreed return date in substantially the same condition, ordinary wear excepted.</p>
   <p>Customer acknowledges responsibility for charges associated with the rental as shown above and for additional amounts that may lawfully become due under Nexus Equipment Rentals' final approved rental agreement.</p>
   <p>Customer agrees to promptly notify Nexus Equipment Rentals of damage, loss, theft, malfunction, accident, or any circumstance affecting safe operation of the equipment.</p>
   <p>Customer confirms that the information provided with the rental request and identity-verification submission is accurate to the best of the customer's knowledge.</p>
  </div>

  <label class="contract-check"><input id="contractAccept" type="checkbox"> I have reviewed the rental information and agree to the terms shown above.</label>
  <label>Electronic Signature<input id="contractSignature" class="contract-input" type="text" placeholder="Type your full legal name"></label>
  <p class="contract-esign">By selecting “Sign & Confirm Rental,” you intend your typed name and submission to serve as your electronic signature for this agreement.</p>
  <button class="small-btn red contract-submit" onclick="signRentalContract('${id}')">Sign & Confirm Rental</button>
 </div>`;
};

window.signRentalContract=async id=>{
 const accepted=$('#contractAccept')?.checked;
 const signature=$('#contractSignature')?.value.trim();
 if(!accepted)return msg('You must agree to the rental terms before signing.');
 if(!signature)return msg('Type your full legal name as your electronic signature.');
 const {data:{user}}=await db.auth.getUser();
 const {data:r,error:re}=await db.from('rental_requests').select('*').eq('id',id).eq('customer_id',user.id).maybeSingle();
 if(re||!r)return msg(re?.message||'Rental request not found.');
 if(r.status!=='contract_required')return msg('This contract is no longer available for signing.');

 const {data:p}=await db.from('profiles').select('full_name,email').eq('id',user.id).maybeSingle();
 const {data:eq}=await db.from('equipment').select('name,daily_rate,weekly_rate,deposit').eq('id',r.equipment_id).maybeSingle();
 const signedAt=new Date().toISOString();
 const snapshot={
   version:'1.0',
   customer_name:p?.full_name||signature,
   customer_email:p?.email||user.email,
   equipment_name:eq?.name||'Equipment',
   start_date:r.start_date,end_date:r.end_date,
   daily_rate:eq?.daily_rate??null,weekly_rate:eq?.weekly_rate??null,deposit:eq?.deposit??null,
   terms_version:'Nexus rental agreement template v1.0'
 };
 const {error:ce}=await db.from('rental_contracts').insert({
   rental_request_id:id,customer_id:user.id,signature_name:signature,signed_at:signedAt,
   accepted:true,contract_snapshot:snapshot
 });
 if(ce)return msg(ce.message);
 const {error:ue}=await db.from('rental_requests').update({status:'confirmed'}).eq('id',id).eq('customer_id',user.id);
 if(ue)return msg(ue.message);
 document.getElementById('rentalContractModal')?.remove();
 msg('Contract signed. Your rental is confirmed.');
 loadCustomer();
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
