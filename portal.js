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
 const metadata={
   full_name:$('#signupName').value.trim(),
   phone:$('#signupPhone').value.trim(),
   account_type:$('#signupType').value,
   business_name:$('#signupBusiness').value.trim()||null
 };
 const {data,error}=await db.auth.signUp({email,password,options:{data:metadata}});
 if(error){
   if(String(error.message).toLowerCase().includes('rate limit')) return msg('Too many confirmation emails have been requested. Please wait and try again later.');
   return msg(error.message);
 }
 msg(data.session?'Account created. Your Nexus client profile is pending approval.':'Account created. Check your email to confirm your address, then sign in. Your profile will be pending Nexus approval.');
 e.target.reset();
};
async function isAdmin(){const {data}=await db.rpc('is_admin');return !!data}

$$('.admin-tab').forEach(b=>b.onclick=()=>{ $$('.admin-tab').forEach(x=>x.classList.remove('active')); $$('.admin-panel').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('#tab-'+b.dataset.tab).classList.add('active') });

async function loadCustomer(){
 const {data:{user}}=await db.auth.getUser();
 let {data:p}=await db.from('profiles').select('*').eq('id',user.id).maybeSingle();

 // Backfill older accounts from Auth metadata when the profile row is missing name/phone.
 const meta=user.user_metadata||{};
 const patch={};
 if(!p?.full_name && meta.full_name) patch.full_name=meta.full_name;
 if((!p?.phone || p.phone===user.email) && meta.phone) patch.phone=meta.phone;
 if(!p?.account_type && meta.account_type) patch.account_type=meta.account_type;
 if(!p?.business_name && meta.business_name) patch.business_name=meta.business_name;
 if(Object.keys(patch).length){
   const {data:updated}=await db.from('profiles').update(patch).eq('id',user.id).select('*').maybeSingle();
   if(updated) p=updated;
 }

 const status=p?.approval_status||'pending';
 $('#customerStatus').textContent=status;
 const displayName=p?.full_name||meta.full_name||'Name not added';
 const displayPhone=(p?.phone && p.phone!==user.email)?p.phone:(meta.phone||'Phone not added');
 const acct=(p?.account_type||meta.account_type||'individual')==='business'
   ? (p?.business_name||meta.business_name||'Business account')
   : 'Individual account';
 $('#profileInfo').innerHTML=`<b>${esc(displayName)}</b><br>${esc(acct)}<br>${esc(user.email)}<br>${esc(displayPhone)}`;

 await loadVerification(user,p||{});
 await loadCustomerEquipment(status==='approved');
 const {data:r}=await db.from('rental_requests').select('id,start_date,end_date,status,equipment(name)').eq('customer_id',user.id).order('created_at',{ascending:false});
 $('#myRentals').innerHTML=r?.length?r.map(x=>`<div class="notice"><b>${esc(x.equipment?.name||'Equipment')}</b><br>${x.start_date} → ${x.end_date}<br><span class="status">${esc(x.status)}</span></div>`).join(''):'No rental requests yet.'
}
async function loadCustomerEquipment(approved){
 const {data}=await db.from('equipment').select('*').neq('status','inactive').order('created_at',{ascending:false});
 $('#customerEquipment').innerHTML=data?.length?data.map(x=>eqCard(x,false,approved)).join(''):'<div class="equipment-item">No equipment added yet.</div>'
}
function eqCard(x,admin=false,approved=false){
 return `<div class="equipment-item">${x.image_url?`<img src="${esc(x.image_url)}" alt="" class="eq-img">`:''}<span class="status">${esc(x.status)}</span><h3>${esc(x.name)}</h3><p class="muted">${esc(x.category||'Equipment')}</p><p>${esc(x.description||'')}</p><div class="rate-row"><b>${money(x.daily_rate)}/day</b><span>${money(x.weekly_rate)}/week</span></div>${admin?`<div class="admin-actions"><button class="small-btn" onclick="editEq('${x.id}')">Edit</button><button class="small-btn" onclick="manageEqPhotos('${x.id}')">Photos</button><button class="small-btn" onclick="setEq('${x.id}','available')">Available</button><button class="small-btn" onclick="setEq('${x.id}','maintenance')">Maintenance</button><button class="small-btn red" onclick="removeEq('${x.id}')">Remove</button></div>`:(approved&&x.status==='available'?`<button class="small-btn red" onclick="requestRental('${x.id}','${esc(x.name)}')">Request Rental</button>`:'')}</div>`
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
 $('#customerTable').innerHTML=`<table class="admin-table"><thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.full_name||'Name not provided')}</b><small>${esc(x.email||'')}</small>${x.business_name?`<small>${esc(x.business_name)}</small>`:''}</td><td>${esc(x.account_type||'individual')}</td><td><span class="status">${esc(x.approval_status)}</span></td><td>${esc(x.phone||'Phone not provided')}</td><td><div class="admin-actions"><button class="small-btn red" onclick="setCustomer('${x.id}','approved')">Approve</button><button class="small-btn" onclick="openMoreInfoRequest('${x.id}')">More Info</button><button class="small-btn" onclick="setCustomer('${x.id}','rejected')">Reject</button></div></td></tr>`).join('')}</tbody></table>`
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
let selectedEquipmentFiles=[];
const eqImagesInput=$('#eqImages');
if(eqImagesInput){
 eqImagesInput.onchange=e=>{
   selectedEquipmentFiles=[...e.target.files].slice(0,8);
   $('#eqImagePreview').innerHTML=selectedEquipmentFiles.map((f,i)=>`<div class="eq-preview-item"><img src="${URL.createObjectURL(f)}" alt=""><span>${i===0?'COVER':'PHOTO '+(i+1)}</span></div>`).join('');
 };
}
async function uploadEquipmentPhotos(equipmentId,files){
 const urls=[];
 for(let i=0;i<files.length;i++){
   const file=files[i];
   if(file.size>10*1024*1024) throw new Error(`${file.name} is larger than 10 MB.`);
   const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
   const path=`${equipmentId}/${Date.now()}-${i}.${ext}`;
   const {error}=await db.storage.from('equipment-images').upload(path,file,{contentType:file.type,upsert:false});
   if(error) throw error;
   const {data}=db.storage.from('equipment-images').getPublicUrl(path);
   urls.push({equipment_id:equipmentId,storage_path:path,public_url:data.publicUrl,sort_order:i,is_cover:i===0});
 }
 if(urls.length){
   const {error}=await db.from('equipment_images').insert(urls);
   if(error) throw error;
   await db.from('equipment').update({image_url:urls[0].public_url}).eq('id',equipmentId);
 }
 return urls;
}
$('#equipmentForm').onsubmit=async e=>{
 e.preventDefault();
 const button=e.target.querySelector('button[type="submit"]');
 button.disabled=true; button.textContent='Adding Equipment…';
 const row={name:$('#eqName').value,category:$('#eqCategory').value,description:$('#eqDescription').value,daily_rate:$('#eqDaily').value||null,weekly_rate:$('#eqWeekly').value||null,deposit:$('#eqDeposit').value||null};
 const {data:created,error}=await db.from('equipment').insert(row).select().single();
 if(error){button.disabled=false;button.textContent='Add Equipment';return msg(error.message)}
 try{
   if(selectedEquipmentFiles.length) await uploadEquipmentPhotos(created.id,selectedEquipmentFiles);
   e.target.reset(); selectedEquipmentFiles=[]; $('#eqImagePreview').innerHTML='';
   msg('Equipment and photos added.');
   loadAdmin();
 }catch(err){
   msg(`Equipment was added, but photo upload failed: ${err.message}`);
 }
 button.disabled=false; button.textContent='Add Equipment';
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

// --- Nexus secure customer verification ---
async function loadVerification(user, profile){
  let host=document.getElementById('verificationPanel');
  if(!host){
    const accountCard=document.querySelector('#customerView .panel, #customerView .card, #customerView section');
    if(!accountCard) return;
    host=document.createElement('div');
    host.id='verificationPanel';
    host.className='verification-panel';
    accountCard.insertAdjacentElement('afterend',host);
  }

  const {data:v,error}=await db.from('customer_verifications').select('*').eq('user_id',user.id).maybeSingle();
  if(error){
    host.innerHTML=`<div class="verification-head"><div><span class="eyebrow">REQUIRED BEFORE RENTAL APPROVAL</span><h2>Identity Verification</h2></div><span class="verify-status">SETUP REQUIRED</span></div><p class="muted">The verification database is not connected yet. Run <b>SUPABASE-VERIFICATION-SETUP.sql</b> in Supabase SQL Editor, then refresh this page.</p>`;
    return;
  }

  const status=(v?.status||'not_submitted').replaceAll('_',' ');
  host.innerHTML=`
    <div class="verification-head">
      <div><span class="eyebrow">REQUIRED BEFORE RENTAL APPROVAL</span><h2>Identity Verification</h2></div>
      <span class="verify-status">${escapeHtml(status.toUpperCase())}</span>
    </div>
    <p class="muted">Upload a valid driver's license and provide the required taxpayer identifier. Sensitive documents are stored in a private bucket and are not public.</p>
    <form id="verificationForm" class="verification-form">
      <div class="field-grid">
        <label>Legal first name<input id="verifyFirst" required value="${escapeAttr(v?.legal_first_name||'')}"></label>
        <label>Legal last name<input id="verifyLast" required value="${escapeAttr(v?.legal_last_name||'')}"></label>
        <label>Street address<input id="verifyAddress" required value="${escapeAttr(v?.address_line1||'')}"></label>
        <label>City<input id="verifyCity" required value="${escapeAttr(v?.city||'')}"></label>
        <label>State<input id="verifyState" maxlength="2" required value="${escapeAttr(v?.state||'MI')}"></label>
        <label>ZIP code<input id="verifyZip" required inputmode="numeric" value="${escapeAttr(v?.postal_code||'')}"></label>
        <label>License number<input id="verifyLicense" required autocomplete="off" value="${escapeAttr(v?.license_number||'')}"></label>
        <label>License state<input id="verifyLicenseState" maxlength="2" required value="${escapeAttr(v?.license_state||'MI')}"></label>
        <label>License expiration<input id="verifyLicenseExp" type="date" required value="${escapeAttr(v?.license_expiration||'')}"></label>
        <label>Verification type
          <select id="verifyTaxType">
            <option value="ssn" ${v?.tax_id_type==='ssn'?'selected':''}>Individual — SSN</option>
            <option value="ein" ${v?.tax_id_type==='ein'?'selected':''}>Business — EIN</option>
          </select>
        </label>
        <label>SSN or EIN<input id="verifyTaxId" required autocomplete="off" inputmode="numeric" placeholder="${v?.tax_id_last4?'Already submitted ••••'+escapeAttr(v.tax_id_last4):'Enter number'}"></label>
      </div>
      <div class="upload-grid">
        <label class="upload-box">Driver's License — Front<input id="licenseFront" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
        <label class="upload-box">Driver's License — Back<input id="licenseBack" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
      </div>
      <label class="consent"><input id="verifyConsent" type="checkbox" required> I certify this information belongs to me and is accurate. I authorize Nexus Equipment Rentals to review it for rental-account verification.</label>
      <button class="btn primary" type="submit">Submit Verification</button>
      <div id="verifyMsg" class="form-msg"></div>
    </form>`;

  document.getElementById('verificationForm').onsubmit=async ev=>{
    ev.preventDefault();
    const vm=document.getElementById('verifyMsg');
    vm.textContent='Submitting securely…';
    const taxRaw=document.getElementById('verifyTaxId').value.replace(/\D/g,'');
    if(!taxRaw && !v?.tax_id_last4){vm.textContent='Enter an SSN or EIN.';return;}
    const taxType=document.getElementById('verifyTaxType').value;
    if(taxRaw && ((taxType==='ssn'&&taxRaw.length!==9)||(taxType==='ein'&&taxRaw.length!==9))){vm.textContent='SSN/EIN must contain 9 digits.';return;}

    // For safety the browser does NOT store the full SSN/EIN in the database.
    // Only last 4 is retained. Production identity verification should use a dedicated provider.
    const payload={
      user_id:user.id,
      legal_first_name:document.getElementById('verifyFirst').value.trim(),
      legal_last_name:document.getElementById('verifyLast').value.trim(),
      address_line1:document.getElementById('verifyAddress').value.trim(),
      city:document.getElementById('verifyCity').value.trim(),
      state:document.getElementById('verifyState').value.trim().toUpperCase(),
      postal_code:document.getElementById('verifyZip').value.trim(),
      license_number:document.getElementById('verifyLicense').value.trim(),
      license_state:document.getElementById('verifyLicenseState').value.trim().toUpperCase(),
      license_expiration:document.getElementById('verifyLicenseExp').value,
      tax_id_type:taxType,
      tax_id_last4:taxRaw?taxRaw.slice(-4):v.tax_id_last4,
      status:'under_review',
      submitted_at:new Date().toISOString()
    };
    const {error:upErr}=await db.from('customer_verifications').upsert(payload,{onConflict:'user_id'});
    if(upErr){vm.textContent=upErr.message;return;}

    for(const [inputId,kind] of [['licenseFront','license_front'],['licenseBack','license_back']]){
      const file=document.getElementById(inputId).files[0];
      if(!file) continue;
      if(file.size>8*1024*1024){vm.textContent='Each document must be 8 MB or smaller.';return;}
      const ext=(file.name.split('.').pop()||'bin').toLowerCase();
      const path=`${user.id}/${kind}.${ext}`;
      const {error:stErr}=await db.storage.from('customer-verification-documents').upload(path,file,{upsert:true,contentType:file.type});
      if(stErr){vm.textContent=stErr.message;return;}
      const patch={user_id:user.id}; patch[kind+'_path']=path;
      const {error:pErr}=await db.from('customer_verifications').upsert(patch,{onConflict:'user_id'});
      if(pErr){vm.textContent=pErr.message;return;}
    }
    vm.textContent='Verification submitted. Nexus will review your account.';
    await loadVerification(user,profile);
  };
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function escapeAttr(s){return escapeHtml(s);}

db.auth.onAuthStateChange(async (event,session)=>{
  if(session?.user){
    setTimeout(async ()=>{
      const {data:p}=await db.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
      if(p && !document.querySelector('#adminView:not([hidden])')) loadVerification(session.user,p);
    },250);
  }
});

window.manageEqPhotos=async id=>{
 const eq=adminEquipment.find(x=>x.id===id); if(!eq)return;
 let modal=document.getElementById('photoManagerModal');
 if(!modal){modal=document.createElement('div');modal.id='photoManagerModal';modal.className='photo-manager-modal hidden';document.body.appendChild(modal)}
 const {data:imgs,error}=await db.from('equipment_images').select('*').eq('equipment_id',id).order('sort_order');
 if(error)return msg(error.message);
 modal.innerHTML=`<div class="photo-manager-card">
   <button class="photo-close" onclick="document.getElementById('photoManagerModal').classList.add('hidden')">×</button>
   <div class="eyebrow">FLEET MEDIA</div><h2>${esc(eq.name)} Photos</h2>
   <p class="muted">Upload more photos, choose the cover photo, or remove old photos.</p>
   <div class="photo-manager-grid">${(imgs||[]).map(im=>`<div class="managed-photo ${im.is_cover?'cover':''}">
     <img src="${esc(im.public_url)}" alt="">
     <div class="managed-actions">${im.is_cover?'<span class="cover-tag">COVER</span>':`<button onclick="setCoverPhoto('${id}','${im.id}')">Make Cover</button>`}<button class="danger" onclick="deleteEqPhoto('${id}','${im.id}','${esc(im.storage_path)}')">Delete</button></div>
   </div>`).join('')||'<p class="muted">No photos uploaded yet.</p>'}</div>
   <label class="add-photo-box">Add More Photos<input id="moreEqPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
   <button class="btn" id="uploadMorePhotos">Upload Photos</button>
 </div>`;
 modal.classList.remove('hidden');
 document.getElementById('uploadMorePhotos').onclick=async()=>{
   const files=[...document.getElementById('moreEqPhotos').files].slice(0,8);
   if(!files.length)return msg('Choose at least one photo.');
   try{await uploadEquipmentPhotos(id,files);await manageEqPhotos(id);loadAdmin();msg('Photos uploaded.')}catch(e){msg(e.message)}
 };
};
window.setCoverPhoto=async(equipmentId,imageId)=>{
 const {data:img}=await db.from('equipment_images').select('*').eq('id',imageId).single();
 await db.from('equipment_images').update({is_cover:false}).eq('equipment_id',equipmentId);
 const {error}=await db.from('equipment_images').update({is_cover:true}).eq('id',imageId);
 if(error)return msg(error.message);
 await db.from('equipment').update({image_url:img.public_url}).eq('id',equipmentId);
 await manageEqPhotos(equipmentId);loadAdmin();msg('Cover photo updated.');
};
window.deleteEqPhoto=async(equipmentId,imageId,path)=>{
 if(!confirm('Delete this equipment photo?'))return;
 const {data:img}=await db.from('equipment_images').select('*').eq('id',imageId).single();
 await db.storage.from('equipment-images').remove([path]);
 await db.from('equipment_images').delete().eq('id',imageId);
 if(img?.is_cover){
   const {data:next}=await db.from('equipment_images').select('*').eq('equipment_id',equipmentId).order('sort_order').limit(1).maybeSingle();
   await db.from('equipment').update({image_url:next?.public_url||null}).eq('id',equipmentId);
   if(next) await db.from('equipment_images').update({is_cover:true}).eq('id',next.id);
 }
 await manageEqPhotos(equipmentId);loadAdmin();msg('Photo deleted.');
};


// --- Admin customer identity verification review ---
window.openCustomerVerification=async userId=>{
 const customer=adminCustomers.find(x=>x.id===userId);
 if(!customer)return msg('Customer profile not found.');

 const {data:v,error}=await db.from('customer_verifications').select('*').eq('user_id',userId).maybeSingle();
 if(error)return msg(error.message);

 let modal=document.getElementById('verificationReviewModal');
 if(!modal){
   modal=document.createElement('div');
   modal.id='verificationReviewModal';
   modal.className='verification-review-modal hidden';
   document.body.appendChild(modal);
 }

 if(!v){
   modal.innerHTML=`<div class="verification-review-card">
     <button class="review-close" onclick="document.getElementById('verificationReviewModal').classList.add('hidden')">×</button>
     <span class="eyebrow">CUSTOMER VERIFICATION</span>
     <h2>${esc(customer.full_name||customer.email||'Customer')}</h2>
     <div class="review-empty"><b>No verification submitted yet.</b><p>This customer must complete the Identity Verification section in their account before you can verify them.</p></div>
   </div>`;
   modal.classList.remove('hidden'); return;
 }

 const getSigned=async path=>{
   if(!path)return null;
   const {data,error}=await db.storage.from('customer-verification-documents').createSignedUrl(path,300);
   return error?null:data.signedUrl;
 };
 const [frontUrl,backUrl]=await Promise.all([getSigned(v.license_front_path),getSigned(v.license_back_path)]);
 const status=(v.status||'not_submitted').replaceAll('_',' ').toUpperCase();

 modal.innerHTML=`<div class="verification-review-card">
   <button class="review-close" onclick="document.getElementById('verificationReviewModal').classList.add('hidden')">×</button>
   <div class="review-top"><div><span class="eyebrow">CUSTOMER VERIFICATION</span><h2>${esc(customer.full_name||customer.email||'Customer')}</h2><p>${esc(customer.email||'')} · ${esc(customer.phone||'No phone')}</p></div><span class="review-status">${esc(status)}</span></div>

   <div class="review-grid">
     <div class="review-section"><h3>Legal Identity</h3>
       <dl>
        <div><dt>Legal Name</dt><dd>${esc((v.legal_first_name||'')+' '+(v.legal_last_name||''))}</dd></div>
        <div><dt>Address</dt><dd>${esc(v.address_line1||'—')}<br>${esc(v.city||'')}, ${esc(v.state||'')} ${esc(v.postal_code||'')}</dd></div>
        <div><dt>Submitted</dt><dd>${v.submitted_at?new Date(v.submitted_at).toLocaleString():'—'}</dd></div>
       </dl>
     </div>
     <div class="review-section"><h3>Driver's License</h3>
       <dl>
        <div><dt>License Number</dt><dd>${esc(v.license_number||'—')}</dd></div>
        <div><dt>State</dt><dd>${esc(v.license_state||'—')}</dd></div>
        <div><dt>Expiration</dt><dd>${esc(v.license_expiration||'—')}</dd></div>
       </dl>
     </div>
     <div class="review-section"><h3>Tax Identifier</h3>
       <dl>
        <div><dt>Type</dt><dd>${esc((v.tax_id_type||'—').toUpperCase())}</dd></div>
        <div><dt>Stored Value</dt><dd>${v.tax_id_last4?'•••• '+esc(v.tax_id_last4):'Not provided'}</dd></div>
       </dl>
       <p class="security-note">Only the last four digits are retained by this portal.</p>
     </div>
   </div>

   <div class="license-review"><h3>License Documents</h3>
     <div class="license-doc-grid">
       <div><span>FRONT</span>${frontUrl?`<a href="${frontUrl}" target="_blank" rel="noopener"><img src="${frontUrl}" alt="Driver license front"></a>`:'<div class="missing-doc">Not uploaded</div>'}</div>
       <div><span>BACK</span>${backUrl?`<a href="${backUrl}" target="_blank" rel="noopener"><img src="${backUrl}" alt="Driver license back"></a>`:'<div class="missing-doc">Not uploaded</div>'}</div>
     </div>
     <p class="security-note">Document links expire automatically after 5 minutes.</p>
   </div>

   <div class="review-notes">
     <label>Admin Notes / Reason for More Information<textarea id="verificationAdminNotes" rows="4" placeholder="Internal notes or explain what the customer needs to resubmit…">${esc(v.admin_notes||'')}</textarea></label>
   </div>
   <div class="review-actions">
     <button class="btn verify-action" onclick="updateVerificationStatus('${userId}','verified')">Verify Customer</button>
     <button class="btn secondary" onclick="updateVerificationStatus('${userId}','needs_attention')">Needs More Information</button>
     <button class="btn danger-action" onclick="updateVerificationStatus('${userId}','rejected')">Reject Verification</button>
   </div>
 </div>`;
 modal.classList.remove('hidden');
};

window.updateVerificationStatus=async(userId,status)=>{
 const notes=document.getElementById('verificationAdminNotes')?.value.trim()||null;
 if((status==='needs_attention'||status==='rejected') && !notes){
   return msg('Add a note explaining what the customer needs to fix or why verification was rejected.');
 }
 const {data:{user:adminUser}}=await db.auth.getUser();
 const {error}=await db.from('customer_verifications').update({
   status,
   admin_notes:notes,
   reviewed_at:new Date().toISOString(),
   reviewed_by:adminUser.id
 }).eq('user_id',userId);
 if(error)return msg(error.message);
 msg(status==='verified'?'Identity verification approved.':`Verification marked ${status.replace('_',' ')}.`);
 document.getElementById('verificationReviewModal')?.classList.add('hidden');
 loadAdmin();
};

// --- More Information request workflow ---
window.openMoreInfoRequest=userId=>{
 const customer=adminCustomers.find(x=>x.id===userId);
 if(!customer)return msg('Customer not found.');
 let modal=document.getElementById('moreInfoModal');
 if(!modal){modal=document.createElement('div');modal.id='moreInfoModal';modal.className='more-info-modal hidden';document.body.appendChild(modal)}
 modal.innerHTML=`<div class="more-info-card">
   <button class="review-close" onclick="document.getElementById('moreInfoModal').classList.add('hidden')">×</button>
   <span class="eyebrow">CUSTOMER ACTION REQUIRED</span>
   <h2>Request More Information</h2>
   <p class="muted">Tell ${esc(customer.full_name||customer.email||'this customer')} exactly what Nexus needs before the account can be approved.</p>
   <label>What does the customer need to provide?
     <textarea id="moreInfoReason" rows="5" placeholder="Example: Please upload a clearer photo of the front of your driver's license and confirm your current address."></textarea>
   </label>
   <div class="review-actions">
     <button class="btn" onclick="sendMoreInfoRequest('${userId}')">Send Request</button>
     <button class="btn secondary" onclick="document.getElementById('moreInfoModal').classList.add('hidden')">Cancel</button>
   </div>
 </div>`;
 modal.classList.remove('hidden');
};
window.sendMoreInfoRequest=async userId=>{
 const reason=document.getElementById('moreInfoReason')?.value.trim();
 if(!reason)return msg('Enter what information the customer needs to provide.');
 const {error}=await db.from('profiles').update({
   approval_status:'more_info',
   more_info_request:reason,
   more_info_requested_at:new Date().toISOString()
 }).eq('id',userId);
 if(error)return msg(error.message);
 // Also place the reason on verification record when one exists.
 await db.from('customer_verifications').update({status:'needs_attention',admin_notes:reason}).eq('user_id',userId);
 document.getElementById('moreInfoModal')?.classList.add('hidden');
 msg('More information request saved. The customer will see it in their portal.');
 loadAdmin();
};

async function loadCustomerActionRequest(userId){
 const {data:p}=await db.from('profiles').select('approval_status,more_info_request,more_info_requested_at').eq('id',userId).maybeSingle();
 let el=document.getElementById('customerActionRequest');
 if(!el){
   const host=document.getElementById('verificationPanel');
   if(!host)return;
   el=document.createElement('div');el.id='customerActionRequest';
   host.insertAdjacentElement('beforebegin',el);
 }
 if(p?.approval_status==='more_info' && p.more_info_request){
   el.innerHTML=`<div class="customer-action-alert"><span class="eyebrow">ACTION REQUIRED</span><h3>Nexus Needs More Information</h3><p>${esc(p.more_info_request)}</p><small>Update your verification information below and resubmit it for review.</small></div>`;
 }else el.innerHTML='';
}
db.auth.onAuthStateChange(async(event,session)=>{
 if(session?.user)setTimeout(()=>loadCustomerActionRequest(session.user.id),400);
});
