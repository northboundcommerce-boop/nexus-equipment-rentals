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
window.requestRental=async(id,name)=>{const start=prompt(`Start date for ${name} (YYYY-MM-DD)`);if(!start)return;const end=prompt('End date (YYYY-MM-DD)');if(!end)return;const {data:{user}}=await db.auth.getUser();const {error}=await db.from('rental_requests').insert({customer_id:user.id,equipment_id:id,start_date:start,end_date:end});msg(error?error.message:'Rental request submitted to Nexus.');loadCustomer()};

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
 $('#customerTable').innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.full_name||'No name')}</b><small>${esc(x.email||'')}</small>${x.business_name?`<small>${esc(x.business_name)}</small>`:''}</td><td>${esc(x.account_type||'individual')}</td><td><span class="status">${esc(x.approval_status)}</span></td><td>${esc(x.phone||'—')}</td><td><div class="admin-actions"><button class="small-btn red" onclick="setCustomer('${x.id}','approved')">Approve</button><button class="small-btn" onclick="setCustomer('${x.id}','more_info')">More Info</button><button class="small-btn" onclick="setCustomer('${x.id}','rejected')">Reject</button></div></td></tr>`).join('')}</tbody></table>`
}
$('#customerSearch').oninput=renderCustomers;
window.setCustomer=async(id,status)=>{const {error}=await db.from('profiles').update({approval_status:status}).eq('id',id);if(error)return msg(error.message);msg('Customer status updated.');loadAdmin()};

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