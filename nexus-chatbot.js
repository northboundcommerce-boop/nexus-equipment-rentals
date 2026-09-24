(() => {
  const FAQS = [
    {keys:["rent","rental","how do i rent","request"], answer:"To rent equipment, browse the Nexus fleet, create or sign in to your customer account, choose your dates and submit a rental request. Nexus reviews the request before the rental is confirmed.", links:[["Browse Equipment","/equipment.html"],["Customer Portal","/portal.html"]]},
    {keys:["account","sign up","signup","create account"], answer:"You need a Nexus customer account to request equipment and manage your rental. Individual and business accounts are supported.", links:[["Customer Portal","/portal.html"]]},
    {keys:["verify","verification","license","id","identity"], answer:"Nexus may require identity and driver's-license verification before approving rental access. Verification can include your legal name, address, license information and identification documents.", links:[["Customer Portal","/portal.html"]]},
    {keys:["approve","approval","pending"], answer:"Rental requests and customer accounts may require Nexus review. You can track your account and rental status from the Customer Portal.", links:[["Customer Portal","/portal.html"]]},
    {keys:["pay","payment","card","checkout"], answer:"Payment is required before equipment pickup. When your payment request is ready, complete the secure online checkout from your Nexus Customer Portal.", links:[["Customer Portal","/portal.html"]]},
    {keys:["deposit"], answer:"Some rentals may include a deposit. If a deposit applies, it will be shown as part of your rental payment request before you pay.", links:[]},
    {keys:["contract","agreement","sign"], answer:"After Nexus approves the rental, the required rental agreement is made available through your account. Review and sign it before completing the remaining rental steps.", links:[["Customer Portal","/portal.html"]]},
    {keys:["cancel","cancellation"], answer:"Eligible rentals can be cancelled before they become active. Once equipment has been picked up and the rental is active, online cancellation is not available. Contact Nexus if you need help.", links:[["Contact Nexus","/contact.html"]]},
    {keys:["extend","extension","longer"], answer:"Contact Nexus before your scheduled return date to request an extension. Extensions depend on equipment availability and may change the rental amount.", links:[["Contact Nexus","/contact.html"]]},
    {keys:["pickup","pick up"], answer:"Before pickup, complete all required approval, verification, contract and payment steps shown for your rental.", links:[["Customer Portal","/portal.html"]]},
    {keys:["return","late"], answer:"If you may return equipment late, contact Nexus as soon as possible. Applicable terms or charges are governed by your rental agreement.", links:[["Contact Nexus","/contact.html"]]},
    {keys:["damage","damaged","broken","problem"], answer:"Report equipment damage or problems to Nexus as soon as possible. Responsibility for damage and related charges is governed by your signed rental agreement.", links:[["Contact Nexus","/contact.html"]]},
    {keys:["business","company","ein"], answer:"Nexus supports business customer accounts. Choose the business option when creating your profile and provide the requested business information.", links:[["Customer Portal","/portal.html"]]},
    {keys:["available","availability","equipment","machine","fleet"], answer:"You can browse the current Nexus fleet on the Equipment page. Rental availability is still subject to the dates requested and Nexus approval.", links:[["Browse Equipment","/equipment.html"]]},
    {keys:["human","person","team","contact","help","support"], answer:"I can help with common Nexus rental questions. For something specific to your account, equipment or rental, contact the Nexus team.", links:[["Contact Nexus","/contact.html"]]},
    {keys:["faq","questions"], answer:"You can also view the full Nexus FAQ for answers about accounts, verification, payments, contracts, pickup, returns and cancellations.", links:[["View FAQ","/faq.html"]]}
  ];

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();

  function findAnswer(q){
    const n = normalize(q);
    let best=null, score=0;
    FAQS.forEach(item=>{
      let s=0;
      item.keys.forEach(k=>{
        const key=normalize(k);
        if(n.includes(key)) s += key.includes(" ") ? 4 : 2;
        else key.split(" ").forEach(w=>{ if(w.length>3 && n.includes(w)) s += .5; });
      });
      if(s>score){score=s;best=item;}
    });
    return score>=1 ? best : null;
  }

  function init(){
    if(document.getElementById("nexusChat")) return;
    const wrap=document.createElement("div");
    wrap.id="nexusChat";
    wrap.innerHTML=`
      <button class="nx-chat-launch" aria-label="Open Ask Nexus chat">
        <span class="nx-chat-pulse"></span><b>N</b><span>Ask Nexus</span>
      </button>
      <section class="nx-chat-panel" aria-label="Ask Nexus" aria-hidden="true">
        <header><div class="nx-chat-logo">N</div><div><strong>ASK NEXUS</strong><small><i></i> Rental Assistant</small></div><button class="nx-chat-close" aria-label="Close chat">×</button></header>
        <div class="nx-chat-body">
          <div class="nx-msg bot"><span>Hi! I'm the Nexus Rental Assistant. I can answer common questions about rentals, verification, contracts, payments, pickup and returns.</span></div>
          <div class="nx-quick">
            <button>How do I rent equipment?</button>
            <button>When do I pay?</button>
            <button>Do I need a deposit?</button>
            <button>Can I cancel a rental?</button>
          </div>
        </div>
        <form class="nx-chat-form"><input maxlength="240" autocomplete="off" placeholder="Ask a rental question…" aria-label="Ask a rental question"><button aria-label="Send">➜</button></form>
        <div class="nx-chat-note">Answers general Nexus rental questions. For account-specific help, contact Nexus.</div>
      </section>`;
    document.body.appendChild(wrap);

    const panel=wrap.querySelector(".nx-chat-panel"), body=wrap.querySelector(".nx-chat-body"), input=wrap.querySelector("input");
    const setOpen = open => { panel.classList.toggle("open",open); panel.setAttribute("aria-hidden",String(!open)); if(open) setTimeout(()=>input.focus(),120); };
    wrap.querySelector(".nx-chat-launch").onclick=()=>setOpen(true);
    wrap.querySelector(".nx-chat-close").onclick=()=>setOpen(false);

    function add(text,type="bot",links=[]){
      const d=document.createElement("div"); d.className=`nx-msg ${type}`;
      d.innerHTML=`<span>${escapeHtml(text)}</span>`;
      if(links.length){
        const l=document.createElement("div"); l.className="nx-chat-links";
        links.forEach(([label,url])=>{const a=document.createElement("a");a.href=url;a.textContent=label+" →";l.appendChild(a)});
        d.appendChild(l);
      }
      body.appendChild(d); body.scrollTop=body.scrollHeight;
    }
    function ask(q){
      if(!q.trim())return;
      add(q,"user");
      const result=findAnswer(q);
      setTimeout(()=>{
        if(result) add(result.answer,"bot",result.links);
        else add("I don't have a verified Nexus answer for that question yet. Please contact the Nexus team so we don't give you incorrect rental information.","bot",[["Contact Nexus","/contact.html"],["View FAQ","/faq.html"]]);
      },220);
    }
    wrap.querySelector(".nx-chat-form").onsubmit=e=>{e.preventDefault();const q=input.value;input.value="";ask(q)};
    wrap.querySelectorAll(".nx-quick button").forEach(b=>b.onclick=()=>ask(b.textContent));
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();