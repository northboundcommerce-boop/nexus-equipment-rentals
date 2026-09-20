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
 $('#profileInfo').innerHTML=`<b>${esc(p?.full_name||user.email)}</b><br>${esc(p?.business_name||'Individual account')}<br>${esc(user.email)}`;
 await loadCustomerEquipment(status==='approved');
 const {data:r}=await db.from('rental_requests').select('id,start_date,end_date,status,equipment(name)').eq('customer_id',user.id).order('created_at',{ascending:false});
 $('#myRentals').innerHTML=r?.length?r.map(x=>`<div class="notice client-rental-row"><div class="client-rental-info"><b>${esc(x.equipment?.name||'Equipment')}</b><br>${x.start_date} → ${x.end_date}<br><span class="status">${esc(x.status)}</span>${x.status==='contract_required'?`<button class="small-btn red contract-sign-btn" onclick="openRentalContract('${x.id}')">Review & Sign Contract</button>`:''}${x.status==='confirmed'?`<small class="contract-signed-note">✓ Contract signed — rental confirmed</small>`:''}</div>${['pending','contract_required','confirmed'].includes(x.status)?`<button class="client-cancel-x" onclick="cancelMyRental('${x.id}','${esc(x.equipment?.name||'Equipment')}')" title="Cancel rental request" aria-label="Cancel rental request">×</button>`:''}</div>`).join(''):'No rental requests yet.'
}

window.cancelMyRental=async(id,name)=>{
 if(!confirm(`Cancel your ${name} rental request?`))return;
 const {data:{user}}=await db.auth.getUser();
 const {data:r,error:readError}=await db.from('rental_requests').select('id,status,customer_id').eq('id',id).eq('customer_id',user.id).maybeSingle();
 if(readError)return msg(readError.message);
 if(!r)return msg('Rental request not found.');
 if(!['pending','contract_required','confirmed'].includes(r.status))return msg('This rental can no longer be cancelled online. Please contact Nexus.');
 const {error}=await db.from('rental_requests').update({status:'cancelled'}).eq('id',id).eq('customer_id',user.id);
 if(error)return msg(error.message);
 msg('Rental request cancelled.');
 await loadCustomer();
};

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
 const rows=adminCustomers.filter(x=>[x.full_name,x.email,x.business_name,x.phone].some(v=>String(v||'').toLowerCase().includes(q)));
 $('#customerTable').innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.full_name||'No name')}</b><small>${esc(x.email||'')}</small>${x.business_name?`<small>${esc(x.business_name)}</small>`:''}</td><td>${esc(x.account_type||'individual')}</td><td><span class="status">${esc(x.approval_status)}</span></td><td>${esc(x.phone||'—')}</td><td><div class="admin-actions"><button class="small-btn red" onclick="setCustomer('${x.id}','approved')">Approve</button><button class="small-btn" onclick="setCustomer('${x.id}','more_info')">More Info</button><button class="small-btn" onclick="setCustomer('${x.id}','rejected')">Reject</button></div></td></tr>`).join('')}</tbody></table>`
}
$('#customerSearch').oninput=renderCustomers;
window.setCustomer=async(id,status)=>{const {error}=await db.from('profiles').update({approval_status:status}).eq('id',id);if(error)return msg(error.message);msg('Customer status updated.');loadAdmin()};

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
    ${x.status==='confirmed'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">View Contract</button><button class="small-btn red" onclick="setRental('${x.id}','active')">Picked Up</button>`:''}
    ${x.status==='active'?`<button class="small-btn" onclick="viewSignedContract('${x.id}')">View Contract</button><button class="small-btn red" onclick="setRental('${x.id}','completed')">Returned</button>`:''}
    ${['pending','contract_required','confirmed'].includes(x.status)?`<button class="small-btn" onclick="setRental('${x.id}','rejected')">Reject</button>`:''}
  </div></td>
 </tr>`).join('')}</tbody></table>`;
}

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
window.editEq=async id=>{const x=adminEquipment.find(e=>e.id===id);if(!x)return;const name=prompt('Equipment name',x.name);if(name===null)return;const daily=prompt('Daily rate',x.daily_rate??'');if(daily===null)return;const weekly=prompt('Weekly rate',x.weekly_rate??'');if(weekly===null)return;const deposit=prompt('Deposit',x.deposit??'');if(deposit===null)return;const {error}=await db.from('equipment').update({name,daily_rate:daily||null,weekly_rate:weekly||null,deposit:deposit||null}).eq('id',id);if(error)return msg(error.message);msg('Equipment updated.');loadAdmin()};
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
