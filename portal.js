const db=window.nexusDb,$=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
let adminCustomers=[],adminRentals=[],adminEquipment=[];
const esc=(s='')=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>v==null||v===''?'—':'$'+Number(v).toFixed(2);
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
 const {data:p}=await db.from('profiles').select('*').eq('id',user.id).maybeSingle();
 const status=p?.approval_status||'pending';
 $('#customerStatus').textContent=status;
 $('#profileInfo').innerHTML=`<b>${esc(p?.full_name||user.email)}</b><br>${esc(p?.business_name||'Individual account')}<br>${esc(user.email)}`;
 await loadCustomerEquipment(status==='approved');
 const {data:r}=await db.from('rental_requests').select('id,start_date,end_date,status,equipment(name)').eq('customer_id',user.id).order('created_at',{ascending:false});
 $('#myRentals').innerHTML=r?.length?r.map(x=>`<div class="notice"><b>${esc(x.equipment?.name||'Equipment')}</b><br>${x.start_date} → ${x.end_date}<br><span class="status">${esc(x.status)}</span></div>`).join(''):'No rental requests yet.'
}
async function loadCustomerEquipment(approved){
 const {data}=await db.from('equipment').select('*').neq('status','inactive').order('created_at',{ascending:false});
 $('#customerEquipment').innerHTML=data?.length?data.map(x=>eqCard(x,false,approved)).join(''):'<div class="equipment-item">No equipment added yet.</div>'
}
function eqCard(x,admin=false,approved=false){
 return `<div class="equipment-item">${x.image_url?`<img src="${esc(x.image_url)}" alt="" class="eq-img">`:''}<span class="status">${esc(x.status)}</span><h3>${esc(x.name)}</h3><p class="muted">${esc(x.category||'Equipment')}</p><p>${esc(x.description||'')}</p><div class="rate-row"><b>${money(x.daily_rate)}/day</b><span>${money(x.weekly_rate)}/week</span></div>${admin?`<div class="admin-actions"><button class="small-btn" onclick="editEq('${x.id}')">Edit</button><button class="small-btn" onclick="setEq('${x.id}','available')">Available</button><button class="small-btn" onclick="setEq('${x.id}','maintenance')">Maintenance</button><button class="small-btn red" onclick="removeEq('${x.id}')">Remove</button></div>`:(approved&&x.status==='available'?`<button class="small-btn red" onclick="requestRental('${x.id}','${esc(x.name)}')">Request Rental</button>`:'')}</div>`
}
window.requestRental=async(id,name)=>{
 const equipment=adminEquipment.find(x=>x.id===id);
 let modal=document.getElementById('rentalRequestModal');
 if(!modal){modal=document.createElement('div');modal.id='rentalRequestModal';document.body.appendChild(modal)}
 const today=new Date().toISOString().slice(0,10);
 modal.className='rental-form-modal';
 modal.innerHTML=`<div class="rental-form-card">
   <button class="rental-form-close" onclick="document.getElementById('rentalRequestModal').remove()">×</button>
   <p class="nexus-kicker">NEXUS EQUIPMENT RENTALS</p>
   <h2>Request ${esc(name)}</h2>
   <p class="muted">Choose your rental dates and tell us about the job. Nexus will review availability before confirming the rental.</p>
   <form id="rentalRequestForm">
    <div class="rental-form-grid">
     <label>Start Date<input id="rentalStart" type="date" min="${today}" required></label>
     <label>End Date<input id="rentalEnd" type="date" min="${today}" required></label>
     <label>Job / Project Type<input id="rentalProject" type="text" placeholder="Excavation, grading, cleanup..."></label>
     <label>Job Site City<input id="rentalCity" type="text" placeholder="City"></label>
    </div>
    <label>Rental Notes<textarea id="rentalNotes" rows="4" placeholder="Tell Nexus what you're using the equipment for, delivery needs, questions, etc."></textarea></label>
    <div class="rental-summary">
      <div><span>Equipment</span><b>${esc(name)}</b></div>
      ${equipment?.daily_rate?`<div><span>Daily Rate</span><b>${money(equipment.daily_rate)}</b></div>`:''}
      ${equipment?.weekly_rate?`<div><span>Weekly Rate</span><b>${money(equipment.weekly_rate)}</b></div>`:''}
      ${equipment?.deposit?`<div><span>Deposit</span><b>${money(equipment.deposit)}</b></div>`:''}
    </div>
    <label class="rental-agree"><input id="rentalAgree" type="checkbox" required> I understand this is a rental request and is not confirmed until approved by Nexus.</label>
    <button class="small-btn red rental-submit" type="submit">Submit Rental Request</button>
   </form>
 </div>`;
 $('#rentalRequestForm').onsubmit=async e=>{
   e.preventDefault();
   const start=$('#rentalStart').value,end=$('#rentalEnd').value;
   if(end<start)return msg('End date must be on or after the start date.');
   const notes=[
     $('#rentalProject').value.trim()?`Project: ${$('#rentalProject').value.trim()}`:'',
     $('#rentalCity').value.trim()?`Job site city: ${$('#rentalCity').value.trim()}`:'',
     $('#rentalNotes').value.trim()
   ].filter(Boolean).join('\n');
   const btn=e.target.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Submitting...';
   const {data:{user}}=await db.auth.getUser();
   const {error}=await db.from('rental_requests').insert({customer_id:user.id,equipment_id:id,start_date:start,end_date:end,customer_notes:notes||null});
   if(error){btn.disabled=false;btn.textContent='Submit Rental Request';return msg(error.message)}
   modal.remove();msg('Rental request submitted to Nexus for approval.');loadCustomer();
 };
};

async function loadAdmin(){
 const [pc,rr,eq]=await Promise.all([
  db.from('profiles').select('*').order('created_at',{ascending:false}),
  db.from('rental_requests').select('*,equipment(name,daily_rate,weekly_rate),profiles!rental_requests_customer_id_fkey(full_name,email,business_name)').order('created_at',{ascending:false}),
  db.from('equipment').select('*').order('created_at',{ascending:false})
 ]);
 adminCustomers=pc.data||[]; adminRentals=rr.data||[]; adminEquipment=eq.data||[];
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
 const upcoming=adminRentals.filter(x=>['approved','active'].includes(x.status)).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,5);
 $('#upcomingList').innerHTML=upcoming.length?upcoming.map(x=>`<div class="notice"><b>${esc(x.equipment?.name||'Equipment')}</b><br>${esc(x.profiles?.full_name||x.profiles?.email||'Customer')}<br>${x.start_date} → ${x.end_date}</div>`).join(''):'No upcoming rentals.';
}
function renderCustomers(){
 const q=($('#customerSearch')?.value||'').toLowerCase();
 const rows=adminCustomers.filter(x=>[x.full_name,x.email,x.business_name,x.phone].some(v=>String(v||'').toLowerCase().includes(q)));
 $('#customerTable').innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.full_name||'Name not provided')}</b><small>${esc(x.email||'')}</small>${x.business_name?`<small>${esc(x.business_name)}</small>`:''}</td><td>${esc(x.account_type||'individual')}</td><td><span class="status">${esc(x.approval_status||'pending')}</span></td><td>${esc(x.phone||'Phone not provided')}</td><td><div class="admin-actions"><button class="small-btn" onclick="openCustomerProfile('${x.id}')">View Profile</button><button class="small-btn red" onclick="setCustomer('${x.id}','approved')">Approve</button><button class="small-btn" onclick="openMoreInfo('${x.id}')">More Info</button><button class="small-btn" onclick="setCustomer('${x.id}','rejected')">Reject</button></div></td></tr>`).join('')}</tbody></table>`
}
$('#customerSearch').oninput=renderCustomers;

window.setCustomer=async(id,status)=>{
 if(status==='approved'){
   const {data:v,error:ve}=await db.from('customer_verifications').select('status').eq('user_id',id).maybeSingle();
   if(ve)return msg('Could not check verification: '+ve.message);
   if(!v||v.status!=='verified')return msg('Verify this customer’s identity before approving the rental account.');
 }
 const {error}=await db.from('profiles').update({approval_status:status}).eq('id',id);
 if(error)return msg(error.message);
 msg('Customer status updated.');
 loadAdmin()
};

window.openCustomerProfile=async id=>{
 const c=adminCustomers.find(x=>x.id===id);
 if(!c)return msg('Customer not found.');
 const [{data:v,error:ve},{data:r,error:re}]=await Promise.all([
   db.from('customer_verifications').select('*').eq('user_id',id).maybeSingle(),
   db.from('rental_requests').select('id,start_date,end_date,status,equipment(name)').eq('customer_id',id).order('created_at',{ascending:false})
 ]);
 if(ve)return msg('Could not load verification: '+ve.message);
 if(re)return msg('Could not load rentals: '+re.message);

 const signed=async path=>{
   if(!path)return null;
   const {data,error}=await db.storage.from('customer-verification-documents').createSignedUrl(path,300);
   return error?null:data?.signedUrl;
 };
 const [front,back]=v?await Promise.all([signed(v.license_front_path),signed(v.license_back_path)]):[null,null];

 let modal=document.getElementById('customerProfileModal');
 if(!modal){modal=document.createElement('div');modal.id='customerProfileModal';document.body.appendChild(modal)}
 modal.className='nexus-modal';
 modal.innerHTML=`<div class="nexus-modal-card">
  <button class="nexus-modal-close" onclick="document.getElementById('customerProfileModal').remove()">×</button>
  <p class="nexus-kicker">NEXUS CUSTOMER PROFILE</p>
  <h2>${esc(c.full_name||'Name not provided')}</h2>
  <p class="muted">${esc(c.email||'')} · ${esc(c.phone||'Phone not provided')}</p>

  <div class="nexus-profile-grid">
   <section><h3>Account</h3>
    <p><b>Type:</b> ${esc(c.account_type||'individual')}</p>
    <p><b>Business:</b> ${esc(c.business_name||'—')}</p>
    <p><b>Account Status:</b> ${esc(c.approval_status||'pending')}</p>
   </section>
   <section><h3>Identity Verification</h3>
    <p><b>Status:</b> ${esc((v?.status||'not submitted').replaceAll('_',' '))}</p>
    <p><b>Legal Name:</b> ${v?esc(`${v.legal_first_name||''} ${v.legal_last_name||''}`.trim()||'—'):'—'}</p>
    <p><b>Submitted:</b> ${v?.submitted_at?new Date(v.submitted_at).toLocaleString():'—'}</p>
   </section>
   <section><h3>Address</h3>
    <p>${v?`${esc(v.address_line1||'—')}<br>${esc(v.city||'')}, ${esc(v.state||'')} ${esc(v.postal_code||'')}`:'No verification submitted.'}</p>
   </section>
   <section><h3>Driver's License</h3>
    <p><b>Number:</b> ${esc(v?.license_number||'—')}</p>
    <p><b>State:</b> ${esc(v?.license_state||'—')}</p>
    <p><b>Expiration:</b> ${esc(v?.license_expiration||'—')}</p>
   </section>
   <section><h3>SSN / EIN</h3>
    <p><b>Type:</b> ${esc((v?.tax_id_type||'—').toUpperCase())}</p>
    <p><b>Last 4:</b> ${v?.tax_id_last4?'•••• '+esc(v.tax_id_last4):'—'}</p>
   </section>
  </div>

  <section class="nexus-docs"><h3>Driver's License Images</h3>
   <div class="nexus-doc-grid">
    <div><b>FRONT</b>${front?`<a href="${front}" target="_blank" rel="noopener"><img src="${front}" alt="License front"></a>`:'<div class="nexus-empty">Not uploaded</div>'}</div>
    <div><b>BACK</b>${back?`<a href="${back}" target="_blank" rel="noopener"><img src="${back}" alt="License back"></a>`:'<div class="nexus-empty">Not uploaded</div>'}</div>
   </div>
  </section>

  <section><h3>Admin Notes</h3><textarea id="profileVerificationNotes" class="nexus-notes" rows="4" placeholder="Add review notes...">${esc(v?.admin_notes||'')}</textarea></section>

  <section><h3>Rental History</h3>
   <div>${r?.length?r.map(x=>`<div class="nexus-rental"><b>${esc(x.equipment?.name||'Equipment')}</b><span>${esc(x.status||'')}</span><small>${esc(x.start_date||'')} → ${esc(x.end_date||'')}</small></div>`).join(''):'<div class="nexus-empty">No rental history.</div>'}</div>
  </section>

  <div class="nexus-profile-actions">
   <button class="small-btn red" onclick="reviewVerification('${id}','verified')">Verify Identity</button>
   <button class="small-btn" onclick="reviewVerification('${id}','needs_attention')">Needs More Info</button>
   <button class="small-btn" onclick="reviewVerification('${id}','rejected')">Reject Verification</button>
   <button class="small-btn red" onclick="setCustomer('${id}','approved')">Approve Account</button>
  </div>
 </div>`;
};

window.reviewVerification=async(id,status)=>{
 const notes=$('#profileVerificationNotes')?.value.trim()||null;
 if(status!=='verified'&&!notes)return msg('Add a note explaining what the customer needs to provide.');
 const {data:v}=await db.from('customer_verifications').select('id').eq('user_id',id).maybeSingle();
 if(!v)return msg('This customer has not submitted a verification form yet.');
 const {data:{user}}=await db.auth.getUser();
 const {error}=await db.from('customer_verifications').update({status,admin_notes:notes,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq('user_id',id);
 if(error)return msg(error.message);
 if(status==='needs_attention'){
   await db.from('profiles').update({approval_status:'more_info'}).eq('id',id);
 }
 msg(status==='verified'?'Identity verified.':'Verification updated.');
 document.getElementById('customerProfileModal')?.remove();
 loadAdmin();
};

window.openMoreInfo=async id=>{
 const c=adminCustomers.find(x=>x.id===id);
 if(!c)return;
 const reason=prompt(`What information does ${c.full_name||c.email||'this customer'} need to provide?`);
 if(!reason?.trim())return;
 const {error}=await db.from('profiles').update({approval_status:'more_info'}).eq('id',id);
 if(error)return msg(error.message);
 const {data:v}=await db.from('customer_verifications').select('id').eq('user_id',id).maybeSingle();
 if(v)await db.from('customer_verifications').update({status:'needs_attention',admin_notes:reason.trim()}).eq('user_id',id);
 msg('More information requested.');
 loadAdmin();
};

function renderRentals(){
 const f=$('#rentalFilter').value;
 const rows=adminRentals.filter(x=>f==='all'||x.status===f);
 $('#rentalTable').innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Equipment</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.profiles?.full_name||'Customer')}</b><small>${esc(x.profiles?.email||'')}</small></td><td>${esc(x.equipment?.name||'Equipment')}</td><td>${x.start_date}<br><small>to ${x.end_date}</small></td><td><span class="status">${esc(x.status)}</span></td><td><div class="admin-actions"><button class="small-btn red" onclick="setRental('${x.id}','approved')">Approve</button><button class="small-btn" onclick="setRental('${x.id}','active')">Picked Up</button><button class="small-btn" onclick="setRental('${x.id}','completed')">Returned</button><button class="small-btn" onclick="setRental('${x.id}','rejected')">Reject</button></div></td></tr>`).join('')}</tbody></table>`
}
$('#rentalFilter').onchange=renderRentals;
window.setRental=async(id,status)=>{const {error}=await db.from('rental_requests').update({status}).eq('id',id);if(error)return msg(error.message);msg('Rental updated.');loadAdmin()};

function renderEquipment(){
 $('#adminEquipment').innerHTML=adminEquipment.length?adminEquipment.map(x=>eqCard(x,true,false)).join(''):'<div class="equipment-item">No equipment added yet.</div>';
 $('#fleetSummary').innerHTML=`<div class="mini-stat"><b>${adminEquipment.length}</b> total units</div><div class="mini-stat"><b>${adminEquipment.filter(x=>x.status==='available').length}</b> available</div><div class="mini-stat"><b>${adminEquipment.filter(x=>x.status==='maintenance').length}</b> maintenance</div>`;
}
window.setEq=async(id,status)=>{const {error}=await db.from('equipment').update({status,available:status==='available'}).eq('id',id);if(error)return msg(error.message);loadAdmin()};
window.removeEq=async id=>{if(confirm('Remove this equipment?')){const {error}=await db.from('equipment').delete().eq('id',id);if(error)return msg(error.message);loadAdmin()}};
window.editEq=async id=>{const x=adminEquipment.find(e=>e.id===id);if(!x)return;const name=prompt('Equipment name',x.name);if(name===null)return;const daily=prompt('Daily rate',x.daily_rate??'');if(daily===null)return;const weekly=prompt('Weekly rate',x.weekly_rate??'');if(weekly===null)return;const deposit=prompt('Deposit',x.deposit??'');if(deposit===null)return;const {error}=await db.from('equipment').update({name,daily_rate:daily||null,weekly_rate:weekly||null,deposit:deposit||null}).eq('id',id);if(error)return msg(error.message);msg('Equipment updated.');loadAdmin()};
$('#equipmentForm').onsubmit=async e=>{e.preventDefault();const row={name:$('#eqName').value,category:$('#eqCategory').value,description:$('#eqDescription').value,image_url:$('#eqImage').value||null,daily_rate:$('#eqDaily').value||null,weekly_rate:$('#eqWeekly').value||null,deposit:$('#eqDeposit').value||null};const {error}=await db.from('equipment').insert(row);if(error)return msg(error.message);e.target.reset();msg('Equipment added.');loadAdmin()};

function renderCalendar(){
 const rows=adminRentals.filter(x=>['approved','active'].includes(x.status)).sort((a,b)=>a.start_date.localeCompare(b.start_date));
 $('#calendarList').innerHTML=rows.length?rows.map(x=>`<div class="calendar-row"><div class="calendar-date"><b>${new Date(x.start_date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</b><small>${new Date(x.start_date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})}</small></div><div><b>${esc(x.equipment?.name||'Equipment')}</b><p>${esc(x.profiles?.full_name||x.profiles?.email||'Customer')} • through ${x.end_date}</p></div><span class="status">${esc(x.status)}</span></div>`).join(''):'<div class="notice">No approved or active rentals on the calendar.</div>'
}

async function boot(){
 const {data:{session}}=await db.auth.getSession();
 $('#authView').classList.toggle('hidden',!!session);$('#customerView').classList.add('hidden');$('#adminView').classList.add('hidden');
 if(!session)return;
 if(await isAdmin()){$('#adminView').classList.remove('hidden');await loadAdmin()}else{$('#customerView').classList.remove('hidden');await loadCustomer()}
}
boot();
(function addCustomerProfileStyles(){
 if(document.getElementById('nexusCustomerProfileStyles'))return;
 const s=document.createElement('style');s.id='nexusCustomerProfileStyles';
 s.textContent=`
 .nexus-modal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:20px}
 .nexus-modal-card{position:relative;width:min(1050px,100%);max-height:92vh;overflow:auto;background:#0c0c0e;border:1px solid #29292f;border-radius:14px;padding:30px;color:#fff;box-shadow:0 30px 100px #000}
 .nexus-modal-close{position:absolute;right:18px;top:12px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}
 .nexus-kicker{color:#ed1c24;font-size:11px;font-weight:900;letter-spacing:.16em}.nexus-profile-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:22px 0}
 .nexus-profile-grid section,.nexus-docs,.nexus-modal-card>section{border:1px solid #28282e;border-radius:9px;background:#111114;padding:17px;margin-bottom:12px}
 .nexus-profile-grid h3,.nexus-docs h3,.nexus-modal-card>section h3{margin-top:0}.nexus-profile-grid p{color:#d3d3d5;line-height:1.55}
 .nexus-doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.nexus-doc-grid b{display:block;margin-bottom:8px;color:#aaa;font-size:11px}.nexus-doc-grid img{width:100%;height:270px;object-fit:contain;background:#050506;border:1px solid #333;border-radius:8px}
 .nexus-empty{display:grid;place-items:center;min-height:90px;border:1px dashed #3a3a40;border-radius:8px;color:#777}.nexus-doc-grid .nexus-empty{height:270px}
 .nexus-notes{width:100%;box-sizing:border-box;padding:12px;background:#08080a;border:1px solid #37373e;border-radius:7px;color:#fff}
 .nexus-rental{display:grid;grid-template-columns:1fr auto;gap:5px;padding:10px 0;border-bottom:1px solid #26262b}.nexus-rental small{grid-column:1/-1;color:#888}.nexus-rental span{text-transform:uppercase;font-size:11px;color:#aaa}
 .nexus-profile-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
 @media(max-width:720px){.nexus-profile-grid,.nexus-doc-grid{grid-template-columns:1fr}.nexus-modal-card{padding:24px 14px}.nexus-doc-grid img,.nexus-doc-grid .nexus-empty{height:210px}}
 .rental-form-modal{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:20px}.rental-form-card{position:relative;width:min(720px,100%);max-height:92vh;overflow:auto;background:#0d0d10;border:1px solid #303038;border-radius:14px;padding:30px;color:#fff;box-shadow:0 30px 100px #000}.rental-form-close{position:absolute;right:18px;top:12px;background:none;border:0;color:#fff;font-size:34px;cursor:pointer}.rental-form-card h2{margin:6px 0 8px}.rental-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:22px 0 13px}.rental-form-card label{display:block;color:#ddd;font-size:12px;font-weight:800}.rental-form-card input,.rental-form-card textarea{width:100%;box-sizing:border-box;margin-top:7px;padding:13px;border:1px solid #36363e;border-radius:7px;background:#070709;color:#fff;font:inherit}.rental-form-card textarea{resize:vertical}.rental-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:18px 0;padding:15px;border:1px solid #2b2b31;border-radius:9px;background:#09090b}.rental-summary div{display:flex;justify-content:space-between;gap:12px}.rental-summary span{color:#888}.rental-agree{display:flex!important;align-items:flex-start;gap:9px;margin:16px 0;line-height:1.45}.rental-agree input{width:auto!important;margin-top:2px!important}.rental-submit{width:100%;padding:14px!important;font-size:12px!important}.rental-submit:disabled{opacity:.55;cursor:wait}
 @media(max-width:620px){.rental-form-grid,.rental-summary{grid-template-columns:1fr}.rental-form-card{padding:25px 15px}}
 `;
 document.head.appendChild(s);
})();
