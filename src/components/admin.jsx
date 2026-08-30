import { useState, useMemo, useEffect, useRef } from "react";
import { T, inp, btnRed, btnGhost, btnSm } from "../lib/theme.js";
import { callClaudeAPI } from "../lib/utils.js";
import { sb, getUserFeaturesCache, setUserFeaturesCache, setAdminFeaturesCache } from "../lib/supabaseClient.js";
import { SL, Card, BackHeader, getAdminFeatures, ADMIN_KEY, USER_FEATS_KEY, AccDrop } from "./ledger.jsx";
import { ADMIN_FEATURES, PACKAGE_TIERS, USER_PACKAGE_KEY, getUserPackages } from "./settings2.jsx";
import { Dashboard } from "./reports.jsx";

function AccessRequestsPanel({accessRequests,requestsLoading,onApprove,onDismiss}){
  if(requestsLoading)return<div style={{textAlign:"center",padding:"30px 0",color:T.muted,fontSize:12}}>Loading…</div>;
  if(!accessRequests.length)return<div style={{textAlign:"center",padding:"30px 0",color:T.muted,fontSize:12}}>No pending access requests.</div>;
  return(
    <div>
      {accessRequests.map(r=>(
        <div key={r.id} style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,padding:14,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:r.note?8:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>{r.clientEmail}</div>
              <div style={{fontSize:11,color:T.muted,marginTop:1}}>{r.createdAt?new Date(r.createdAt).toLocaleDateString():""}</div>
            </div>
          </div>
          {r.note&&<div style={{fontSize:12,color:T.sub,background:T.bg,borderRadius:8,padding:"8px 10px",marginBottom:12}}>{r.note}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>onApprove(r)} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Set up access →</button>
            <button onClick={()=>onDismiss(r)} style={{flex:1,background:"none",border:`1px solid ${T.border}`,color:T.sub,borderRadius:8,padding:"9px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminPanel({onBack,profiles=[],onToggleActive,fetchClientAccessFor,grantClientAccess,revokeClientAccess,fetchCompaniesFor,fetchAccessRequests,dismissAccessRequest,resolveAccessRequestAsGranted,companies=[],createCompany,renameCompany,deleteCompany,activeCompanyId,setActiveCompanyId,isDesktop=false}){
  const[newCompanyName,setNewCompanyName]=useState("");
  const[creatingCompany,setCreatingCompany]=useState(false);
  const[companyError,setCompanyError]=useState("");
  const submitNewCompany=async()=>{
    if(!newCompanyName.trim()||!createCompany||creatingCompany)return;
    setCreatingCompany(true);setCompanyError("");
    const created=await createCompany(newCompanyName.trim());
    setCreatingCompany(false);
    if(created)setNewCompanyName("");
    else setCompanyError("Something went wrong creating the company — check the alert that popped up for the real error.");
  };
  const doDeleteCompany=async(c)=>{
    if(!deleteCompany)return;
    if(!window.confirm(`Permanently delete "${c.name}" and everything in it (accounts, transactions, contacts — all of it)? This can't be undone.`))return;
    const result=await deleteCompany(c.id);
    if(result&&result.error)alert("Couldn't delete: "+result.error);
  };
  const[tab,setTab]=useState("global");
  const[selUser,setSelUser]=useState(null);
  const[clientGrants,setClientGrants]=useState([]);
  const[grantClientId,setGrantClientId]=useState("");
  const[grantLevel,setGrantLevel]=useState("full");
  const[grantCompanyId,setGrantCompanyId]=useState("");
  const[grantClientCompanies,setGrantClientCompanies]=useState([]);
  const[grantBusy,setGrantBusy]=useState(false);
  useEffect(()=>{
    if(!selUser||!fetchClientAccessFor){setClientGrants([]);return;}
    fetchClientAccessFor(selUser.id).then(setClientGrants);
  },[selUser]);
  // Every grant now names exactly one of the client's companies — once a
  // client is picked, load that client's own company list to choose from
  // (an admin managing Redrock's own staff shouldn't have to know a
  // client's company names/IDs by heart).
  useEffect(()=>{
    setGrantCompanyId("");
    if(!grantClientId||!fetchCompaniesFor){setGrantClientCompanies([]);return;}
    fetchCompaniesFor(grantClientId).then(setGrantClientCompanies);
  },[grantClientId]);
  const addGrant=async()=>{
    if(!grantClientId||!grantCompanyId||!grantClientAccess)return;
    setGrantBusy(true);
    const result=await grantClientAccess(selUser.id,grantClientId,grantLevel,grantCompanyId);
    setGrantBusy(false);
    if(result.error){alert(result.error);return;}
    setGrantClientId("");
    setGrantCompanyId("");
    fetchClientAccessFor(selUser.id).then(setClientGrants);
  };
  const removeGrant=async(grantId)=>{
    if(!revokeClientAccess)return;
    await revokeClientAccess(grantId);
    setClientGrants(prev=>prev.filter(g=>g.id!==grantId));
  };

  // Pending client self-service access requests. These props were already
  // being threaded all the way down from appshell.jsx but this panel never
  // actually rendered anything with them — the whole approval flow was a
  // dead end (a client could request access, but no admin UI ever showed it).
  const[accessRequests,setAccessRequests]=useState([]);
  const[requestsLoading,setRequestsLoading]=useState(false);
  const loadAccessRequests=()=>{
    if(!fetchAccessRequests)return;
    setRequestsLoading(true);
    fetchAccessRequests().then(list=>{setAccessRequests(list);setRequestsLoading(false);});
  };
  useEffect(()=>{if(tab==="requests")loadAccessRequests();},[tab]);
  const approveRequest=(req)=>{
    // "Approve" hands off to the existing Per-user grant flow (company +
    // access level still need picking there) rather than guessing — then
    // marks the request resolved so it drops off this list.
    setSelUser({id:req.clientUserId,email:req.clientEmail,display_name:req.clientEmail});
    setTab("users");
    if(resolveAccessRequestAsGranted)resolveAccessRequestAsGranted(req.id);
    setAccessRequests(prev=>prev.filter(r=>r.id!==req.id));
  };
  const dismissRequest=(req)=>{
    if(!window.confirm(`Dismiss ${req.clientEmail}'s access request?`))return;
    if(dismissAccessRequest)dismissAccessRequest(req.id);
    setAccessRequests(prev=>prev.filter(r=>r.id!==req.id));
  };
  const[search,setSearch]=useState("");
  const[userStatusTab,setUserStatusTab]=useState("active");
  const[selectedUserIds,setSelectedUserIds]=useState([]);
  const[usageEvents,setUsageEvents]=useState([]);
  const[usageLoading,setUsageLoading]=useState(false);
  useEffect(()=>{
    if(tab!=="analytics"||usageEvents.length)return;
    setUsageLoading(true);
    sb.from("usage_events").select("tab_name,created_at").order("created_at",{ascending:false}).limit(5000).then(({data,error})=>{
      if(!error)setUsageEvents(data||[]);
      setUsageLoading(false);
    });
  },[tab]);
  const[features,setFeaturesState]=useState(()=>getAdminFeatures());
  const[userFeats,setUserFeatsState]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(USER_FEATS_KEY)||"{}")}catch{return{};}
  });
  const[userPackages,setUserPackagesState]=useState(()=>getUserPackages());
  const applyPackage=(userId,tierId)=>{
    const tier=PACKAGE_TIERS.find(t=>t.id===tierId);
    if(!tier)return;
    const cur=userFeats[userId]||{};
    const updated={...cur};
    ADMIN_FEATURES.forEach(f=>{updated[f.id]=tier.features.includes(f.id);});
    const n={...userFeats,[userId]:updated};
    setUserFeatsState(n);
    localStorage.setItem(USER_FEATS_KEY,JSON.stringify(n));
    setUserFeaturesCache({...getUserFeaturesCache(),[userId]:updated});
    sb.from("profiles").update({feature_overrides:updated,package_tier:tierId}).eq("id",userId).then(({error})=>{
      if(error)console.error("Package assignment save failed:",error);
    });
    const np={...userPackages,[userId]:tierId};
    setUserPackagesState(np);
    localStorage.setItem(USER_PACKAGE_KEY,JSON.stringify(np));
  };

  const toggleGlobal=(id)=>{
    const n={...features,[id]:features[id]===false?true:false};
    setFeaturesState(n);
    localStorage.setItem(ADMIN_KEY,JSON.stringify(n));
    setAdminFeaturesCache(n);
    sb.from("app_settings").upsert({id:1,admin_features:n}).then(({error})=>{
      if(error)console.error("Global feature toggle save failed:",error);
    });
  };
  const toggleUser=(userId,featureId)=>{
    const cur=(userFeats[userId]||{});
    const newVal=cur[featureId]===false?true:false;
    const n={...userFeats,[userId]:{...cur,[featureId]:newVal}};
    setUserFeatsState(n);
    localStorage.setItem(USER_FEATS_KEY,JSON.stringify(n));
    setUserFeaturesCache({...getUserFeaturesCache(),[userId]:n[userId]});
    sb.from("profiles").update({feature_overrides:n[userId]}).eq("id",userId).then(({error})=>{
      if(error)console.error("Feature toggle save failed:",error);
    });
  };
  // Real, server-side activate/deactivate — is_active also gates RLS on every
  // other table, so this is what actually locks a user out, not just the UI.
  const toggleDeactivate=(userId,isDeactNow)=>{
    if(onToggleActive)onToggleActive(userId,isDeactNow);
  };
  const isGlobalOn=(id)=>features[id]!==false;
  const isUserOn=(userId,id)=>{
    if(!isGlobalOn(id))return false;
    return(userFeats[userId]||{})[id]!==false;
  };

  // A profile with no email (undefined ? undefined : ...) used to crash
  // this whole screen the moment anyone typed into the search box, since
  // .includes() was called directly on `undefined` instead of falling
  // back to an empty string first.
  const filteredProfiles=profiles.filter(p=>!search||(p.email||"").toLowerCase().includes(search.toLowerCase())||(p.display_name||"").toLowerCase().includes(search.toLowerCase()));

  const Toggle=({on,onClick,disabled})=>(
    <div onClick={disabled?undefined:onClick} style={{width:44,height:24,borderRadius:12,background:disabled?"#e5e7eb":on?T.accent:"#D1D5DB",cursor:disabled?"not-allowed":"pointer",position:"relative",transition:"background 0.2s",flexShrink:0,opacity:disabled?0.4:1}}>
      <div style={{position:"absolute",top:3,left:on?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
    </div>
  );

  // ── User Detail Screen ──
  if(selUser){
    const p=profiles.find(x=>x.id===selUser.id)||selUser; // re-read live row so status updates immediately after a toggle
    const isDeact=p.is_active===false;
    // Never approved yet vs. was active and got turned off — both read as
    // is_active:false, so activated_at (stamped on first-ever approval) is
    // what actually tells them apart.
    const isPending=isDeact&&!p.activated_at;
    const userNum=profiles.findIndex(x=>x.id===p.id)+1;
    const deactBtnStyle=isDeact
      ?{background:T.green,color:"#fff",border:"none",borderRadius:10,padding:"11px 0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",width:"100%"}
      :{background:"#fee2e2",color:T.red,border:"1px solid "+T.red,borderRadius:10,padding:"11px 0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",width:"100%"};

    if(isDesktop)return(
      <div style={{maxWidth:900}}>
        <button onClick={()=>setSelUser(null)} style={{background:"none",border:"none",color:T.accent,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:14,padding:0}}>‹ Back to users</button>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1.3fr",gap:20,alignItems:"start"}}>
          <div>
            <div style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:20,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                <div style={{width:56,height:56,borderRadius:"50%",background:isDeact?"#e5e7eb":T.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18,fontWeight:800,flexShrink:0}}>{isDeact?"🚫":"#"+userNum}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:16,fontWeight:800,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.display_name||p.email||"User"}</div>
                  <div style={{fontSize:12,color:T.muted}}>{p.email}</div>
                  <div style={{display:"flex",gap:5,marginTop:6}}>
                    {isDeact&&<span style={{fontSize:10,background:isPending?"#FEF3C7":"#fee2e2",color:isPending?T.orange:T.red,padding:"2px 8px",borderRadius:5,fontWeight:700}}>{isPending?"⏳ PENDING APPROVAL":"🚫 DEACTIVATED"}</span>}
                    {p.is_admin&&<span style={{fontSize:10,background:"#EDE9FE",color:"#7C3AED",padding:"2px 7px",borderRadius:5,fontWeight:800}}>ADMIN</span>}
                  </div>
                </div>
              </div>
              <div style={{fontSize:11,color:T.muted,borderTop:`1px solid ${T.border}`,paddingTop:10}}>Joined: {p.created_at?p.created_at.slice(0,10):"—"}</div>
            </div>
            <div style={{background:isDeact?"#fff8f8":"#fff",borderRadius:14,border:`1px solid ${isDeact?T.red:T.border}`,padding:20}}>
              <div style={{fontSize:13,fontWeight:700,color:isDeact?T.red:T.text,marginBottom:10}}>{isDeact?(isPending?"Awaiting approval":"Account deactivated"):"Account active"}</div>
              {p.is_admin
                ?<div style={{background:"#FEF3C7",borderRadius:10,padding:"10px 14px",fontSize:12,color:T.orange,fontWeight:600}}>⚠️ Admin accounts cannot be deactivated.</div>
                :<button onClick={()=>toggleDeactivate(p.id,isDeact)} style={deactBtnStyle}>{isDeact?(isPending?"✅ Approve Account":"✅ Reactivate Account"):"🚫 Deactivate Account"}</button>
              }
            </div>
          <div style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:20,marginTop:14}}>
            <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>Package</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Assigning a package bulk-sets this user's features to match that plan.</div>
            <div style={{display:"flex",gap:8}}>
              {PACKAGE_TIERS.map(tier=>{
                const active=userPackages[p.id]===tier.id;
                return(
                  <button key={tier.id} onClick={()=>applyPackage(p.id,tier.id)} style={{flex:1,background:active?tier.color:"#fff",color:active?"#fff":T.sub,border:`1.5px solid ${active?tier.color:T.border}`,borderRadius:10,padding:"10px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:800}}>{tier.label}</div>
                    <div style={{fontSize:10,marginTop:2,opacity:0.85}}>{tier.price}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {fetchClientAccessFor&&(
            <div style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:20,marginTop:14}}>
              <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>Client access</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Which clients' companies can this user see, and at what level. Each grant is scoped to one company — a client with several companies needs a separate grant per company.</div>
              {clientGrants.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                  {clientGrants.map(g=>(
                    <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg,borderRadius:8,padding:"8px 12px"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:T.text}}>{g.clientEmail} <span style={{fontWeight:400,color:T.muted}}>· {g.companyName}</span></div>
                        <div style={{fontSize:10,color:T.muted,textTransform:"capitalize"}}>{g.accessLevel} access</div>
                      </div>
                      <button onClick={()=>removeGrant(g.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>Revoke</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8}}>
                  <select value={grantClientId} onChange={e=>setGrantClientId(e.target.value)} style={{...inp,fontSize:12,flex:1}}>
                    <option value="">— Select a client —</option>
                    {profiles.filter(pr=>pr.id!==selUser.id).map(pr=><option key={pr.id} value={pr.id}>{pr.display_name||pr.email}</option>)}
                  </select>
                  <select value={grantLevel} onChange={e=>setGrantLevel(e.target.value)} style={{...inp,fontSize:12,width:120}}>
                    <option value="full">Full</option>
                    <option value="entries">Entries</option>
                    <option value="reports">Reports</option>
                    <option value="readonly">Read-only</option>
                  </select>
                </div>
                {grantClientId&&(
                  <div style={{display:"flex",gap:8}}>
                    <select value={grantCompanyId} onChange={e=>setGrantCompanyId(e.target.value)} style={{...inp,fontSize:12,flex:1}}>
                      <option value="">{grantClientCompanies.length?"— Select which company —":"Loading companies…"}</option>
                      {grantClientCompanies.filter(c=>!clientGrants.some(g=>g.clientUserId===grantClientId&&g.companyId===c.id)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={addGrant} disabled={!grantClientId||!grantCompanyId||grantBusy} style={{background:grantCompanyId?T.accent:T.border,color:grantCompanyId?"#fff":T.muted,border:"none",borderRadius:8,padding:"0 16px",fontWeight:700,fontSize:12,cursor:grantCompanyId?"pointer":"default",fontFamily:"inherit",flexShrink:0}}>{grantBusy?"…":"Grant"}</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:14,border:`1px solid ${T.border}`,padding:20}}>
            <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>Feature access</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Toggle features for this user specifically.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {ADMIN_FEATURES.map(f=>{
                const gOn=isGlobalOn(f.id);
                const uOn=isUserOn(p.id,f.id);
                return(
                  <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.bg,borderRadius:10,border:`1px solid ${T.border}`,opacity:gOn?1:0.4}}>
                    <span style={{fontSize:18}}>{f.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,color:T.text,fontWeight:600}}>{f.label}</div>
                      {!gOn&&<div style={{fontSize:10,color:T.red,fontWeight:600}}>Globally disabled</div>}
                    </div>
                    <Toggle on={uOn} onClick={()=>toggleUser(p.id,f.id)} disabled={!gOn||isDeact}/>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );

    return(
      <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
        <BackHeader title={p.display_name||p.email||"User"} sub="USER DETAIL · ADMIN" onBack={()=>setSelUser(null)}/>
        <div style={{padding:16}}>
          <div style={{background:T.card,borderRadius:14,border:"1px solid "+T.border,padding:16,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:isDeact?"#e5e7eb":T.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,fontWeight:800}}>
                {isDeact?"🚫":"#"+userNum}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,color:T.text}}>{p.display_name||p.email||"User"}</div>
                <div style={{fontSize:11,color:T.muted}}>{p.email}</div>
                <div style={{display:"flex",gap:5,marginTop:4}}>
                  {isDeact&&<span style={{fontSize:10,background:"#fee2e2",color:T.red,padding:"2px 8px",borderRadius:5,fontWeight:700}}>DEACTIVATED / PENDING</span>}
                  {p.is_admin&&<span style={{fontSize:10,background:"#EDE9FE",color:"#7C3AED",padding:"2px 7px",borderRadius:5,fontWeight:800}}>ADMIN</span>}
                </div>
              </div>
            </div>
            <div style={{fontSize:11,color:T.muted}}>Joined: {p.created_at?p.created_at.slice(0,10):"—"}</div>
          </div>

          <div style={{background:isDeact?"#fff8f8":T.card,borderRadius:14,border:"1px solid "+(isDeact?T.red:T.border),padding:16,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:isDeact?T.red:T.text,marginBottom:8}}>{isDeact?"Account Deactivated / Pending":"Account Active"}</div>
            {p.is_admin
              ?<div style={{background:"#FEF3C7",borderRadius:10,padding:"10px 14px",fontSize:12,color:T.orange,fontWeight:600}}>⚠️ Admin accounts cannot be deactivated.</div>
              :<button onClick={()=>toggleDeactivate(p.id,isDeact)} style={deactBtnStyle}>{isDeact?"✅ Activate / Approve Account":"🚫 Deactivate Account"}</button>
            }
          </div>

          <div style={{background:T.card,borderRadius:14,border:"1px solid "+T.border,padding:16,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:4}}>Package</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Bulk-sets this user's features to match a plan.</div>
            <div style={{display:"flex",gap:6}}>
              {PACKAGE_TIERS.map(tier=>{
                const active=userPackages[p.id]===tier.id;
                return(
                  <button key={tier.id} onClick={()=>applyPackage(p.id,tier.id)} style={{flex:1,background:active?tier.color:"#fff",color:active?"#fff":T.sub,border:`1.5px solid ${active?tier.color:T.border}`,borderRadius:10,padding:"8px 6px",cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:800}}>{tier.label}</div>
                    <div style={{fontSize:9,marginTop:2,opacity:0.85}}>{tier.price}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{background:T.card,borderRadius:14,border:"1px solid "+T.border,padding:16}}>
            <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:4}}>Feature Access</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Toggle features for this user.</div>
            {ADMIN_FEATURES.map(f=>{
              const gOn=isGlobalOn(f.id);
              const uOn=isUserOn(p.id,f.id);
              return(
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"8px 10px",background:T.bg,borderRadius:10,border:"1px solid "+T.border,opacity:gOn?1:0.4}}>
                  <span style={{fontSize:18}}>{f.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:T.text,fontWeight:600}}>{f.label}</div>
                    {!gOn&&<div style={{fontSize:10,color:T.red,fontWeight:600}}>Globally disabled</div>}
                  </div>
                  <Toggle on={uOn} onClick={()=>toggleUser(p.id,f.id)} disabled={!gOn||isDeact}/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if(isDesktop){
    const activeProfiles=filteredProfiles.filter(p=>p.is_active!==false);
    const inactiveProfiles=filteredProfiles.filter(p=>p.is_active===false);
    const shownProfiles=userStatusTab==="active"?activeProfiles:inactiveProfiles;
    return(
      <div style={{maxWidth:1000}}>
        <h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>Admin panel</h1>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[["global","Global"],["users","Per user"],["requests",`Access requests${accessRequests.length?` (${accessRequests.length})`:""}`],["companies",`Companies (${companies.length})`],["analytics","Analytics"],["revenue","Revenue"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{background:tab===id?T.accent:"none",color:tab===id?"#fff":T.sub,border:`1px solid ${tab===id?T.accent:T.border}`,borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          ))}
        </div>

        {tab==="requests"&&<AccessRequestsPanel accessRequests={accessRequests} requestsLoading={requestsLoading} onApprove={approveRequest} onDismiss={dismissRequest}/>}

        {tab==="companies"&&(
          <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:14,padding:20,maxWidth:640}}>
            <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:4}}>Your companies</div>
            <div style={{fontSize:12,color:T.sub,marginBottom:18,lineHeight:1.5}}>Each one is a separate, fully isolated set of books under your own login — good for test data you want to throw away later without touching your real books.</div>
            <div style={{display:"flex",gap:8,marginBottom:companyError?8:20}}>
              <input placeholder="e.g. Test 1" value={newCompanyName} onChange={e=>setNewCompanyName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitNewCompany();}} style={{...inp,flex:1}}/>
              <button disabled={!newCompanyName.trim()||creatingCompany} onClick={submitNewCompany} style={{background:newCompanyName.trim()?T.accent:T.border,color:newCompanyName.trim()?"#fff":T.muted,border:"none",borderRadius:8,padding:"0 18px",fontWeight:700,fontSize:13,cursor:newCompanyName.trim()&&!creatingCompany?"pointer":"default",fontFamily:"inherit"}}>{creatingCompany?"Creating…":"+ Create"}</button>
            </div>
            {companyError&&<div style={{fontSize:11,color:T.red,marginBottom:20}}>{companyError}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {companies.map(c=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 4px",borderTop:`1px solid ${T.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                    {c.id===activeCompanyId&&<i className="ti ti-check" style={{fontSize:14,color:T.accent,flexShrink:0}}/>}
                    <span style={{fontSize:13,fontWeight:c.id===activeCompanyId?700:500,color:c.id===activeCompanyId?T.accent:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                    <span style={{fontSize:10,color:T.muted,flexShrink:0}}>{c.created_at?c.created_at.slice(0,10):""}</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    {c.id!==activeCompanyId&&setActiveCompanyId&&<button onClick={()=>setActiveCompanyId(c.id)} style={{...btnSm,background:"none",border:`1px solid ${T.border}`,color:T.sub}}>Switch to</button>}
                    {companies.length>1&&<button onClick={()=>doDeleteCompany(c)} style={{background:T.redLight,color:T.red,border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>}
                  </div>
                </div>
              ))}
              {!companies.length&&<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:12}}>No companies yet.</div>}
            </div>
          </div>
        )}

        {tab==="revenue"&&(()=>{
          const userPkgs=getUserPackages();
          const activeUsers=profiles.filter(p=>p.is_active!==false&&!p.is_admin);
          const byTier={};
          PACKAGE_TIERS.forEach(t=>{byTier[t.id]={tier:t,count:0};});
          let unassigned=0;
          activeUsers.forEach(p=>{
            const pkg=userPkgs[p.id];
            if(pkg&&byTier[pkg])byTier[pkg].count++;
            else unassigned++;
          });
          const parsePrice=(priceStr)=>parseFloat(priceStr.replace(/[^0-9.]/g,""))||0;
          const totalMonthly=Object.values(byTier).reduce((s,b)=>s+b.count*parsePrice(b.tier.price),0);
          return(
            <div>
              <div style={{background:T.waterTealSubtle,borderRadius:12,padding:"18px 24px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:700,color:T.text}}>Estimated monthly revenue — {activeUsers.length} active client{activeUsers.length===1?"":"s"}</span>
                <span style={{fontSize:24,fontWeight:900,color:T.waterTeal}}>PKR {totalMonthly.toLocaleString()}</span>
              </div>
              <div style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <table style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
                  <thead><tr style={{background:T.bg,color:T.sub}}><td style={{padding:"11px 14px",fontWeight:700}}>Package</td><td style={{fontWeight:700}}>Price</td><td style={{textAlign:"right",fontWeight:700}}>Clients</td><td style={{textAlign:"right",fontWeight:700,padding:"11px 14px"}}>Subtotal</td></tr></thead>
                  <tbody>
                    {PACKAGE_TIERS.map(t=>(
                      <tr key={t.id} style={{borderBottom:`1px solid ${T.border}`}}>
                        <td style={{padding:"11px 14px",fontWeight:700,color:t.color}}>{t.label}</td>
                        <td style={{color:T.text}}>{t.price}</td>
                        <td style={{textAlign:"right",color:T.text}}>{byTier[t.id].count}</td>
                        <td style={{textAlign:"right",fontWeight:700,padding:"11px 14px",color:T.text}}>PKR {(byTier[t.id].count*parsePrice(t.price)).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{padding:"11px 14px",color:T.muted}}>No package assigned</td>
                      <td/>
                      <td style={{textAlign:"right",color:T.muted}}>{unassigned}</td>
                      <td style={{padding:"11px 14px"}}/>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{fontSize:11,color:T.muted,marginTop:12}}>Estimated from assigned package tiers — not connected to a real payment processor, so this reflects intended billing, not confirmed collected revenue.</p>
            </div>
          );
        })()}

        {tab==="global"&&(
          <>
            <div style={{background:T.accentLight,borderRadius:10,padding:"10px 14px",marginBottom:16,border:`1px solid ${T.accentMid}`,fontSize:12,color:T.accent,fontWeight:600}}>Global toggles apply to all users. Per-user overrides live in the Per user tab.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {ADMIN_FEATURES.map(f=>(
                <div key={f.id} style={{background:"#fff",borderRadius:12,border:`1px solid ${T.border}`,padding:14,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18,flexShrink:0}}>{f.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:T.text}}>{f.label}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:1}}>{f.desc}</div>
                  </div>
                  <Toggle on={isGlobalOn(f.id)} onClick={()=>toggleGlobal(f.id)}/>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="users"&&(
          <>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              <div style={{position:"relative",width:260}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13}}>🔍</span>
                <input placeholder="Search by name or email..." value={search||""} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:36}}/>
              </div>
              <div style={{display:"flex",gap:6}}>
                {[["active","Active ("+activeProfiles.length+")"],["inactive","Inactive / Pending ("+inactiveProfiles.length+")"]].map(([id,label])=>(
                  <button key={id} onClick={()=>setUserStatusTab(id)} style={{background:userStatusTab===id?T.accent:"none",color:userStatusTab===id?"#fff":T.sub,border:`1px solid ${userStatusTab===id?T.accent:T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
                ))}
              </div>
              {selectedUserIds.length>0&&(
                <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:T.sub}}>{selectedUserIds.length} selected</span>
                  <button onClick={()=>{selectedUserIds.forEach(id=>{const p=profiles.find(x=>x.id===id);if(p&&!p.is_admin)toggleDeactivate(id,p.is_active===false);});setSelectedUserIds([]);}} style={{background:T.greenBg,color:T.green,border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Activate all</button>
                  <button onClick={()=>{selectedUserIds.forEach(id=>{const p=profiles.find(x=>x.id===id);if(p&&!p.is_admin&&p.is_active!==false)toggleDeactivate(id,false);});setSelectedUserIds([]);}} style={{background:T.redLight,color:T.red,border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Deactivate all</button>
                </div>
              )}
            </div>
            <table className="rr-sticky-thead" style={{width:"100%",fontSize:13,borderCollapse:"collapse"}}>
              <thead><tr style={{color:T.muted,fontSize:11}}>
                <td style={{padding:"6px 0"}}><input type="checkbox" checked={shownProfiles.length>0&&shownProfiles.every(p=>selectedUserIds.includes(p.id))} onChange={()=>{
                  if(shownProfiles.every(p=>selectedUserIds.includes(p.id)))setSelectedUserIds(prev=>prev.filter(id=>!shownProfiles.some(p=>p.id===id)));
                  else setSelectedUserIds(prev=>[...new Set([...prev,...shownProfiles.map(p=>p.id)])]);
                }}/></td><td>#</td><td>Name</td><td>Email</td><td>Joined</td><td></td><td></td>
              </tr></thead>
              <tbody>
                {shownProfiles.map(p=>{
                  const isDeact=p.is_active===false;
                  const isPending=isDeact&&!p.activated_at;
                  const realIdx=profiles.findIndex(x=>x.id===p.id);
                  const isSel=selectedUserIds.includes(p.id);
                  return(
                    <tr key={p.id} className="rr-table-row" style={{borderTop:`1px solid ${T.border}`,cursor:"pointer",background:isSel?T.accentLight:"transparent"}}>
                      <td style={{padding:"10px 0"}} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={isSel} onChange={()=>setSelectedUserIds(prev=>isSel?prev.filter(id=>id!==p.id):[...prev,p.id])}/></td>
                      <td onClick={()=>setSelUser(p)} style={{color:T.muted}}>{isDeact?(isPending?"⏳":"🚫"):"#"+(realIdx+1)}</td>
                      <td onClick={()=>setSelUser(p)} style={{fontWeight:700,color:T.text}}>{p.display_name||p.email||"User"}{p.is_admin&&<span style={{fontSize:9,background:"#EDE9FE",color:"#7C3AED",padding:"2px 7px",borderRadius:5,fontWeight:800,marginLeft:6}}>ADMIN</span>}</td>
                      <td onClick={()=>setSelUser(p)} style={{color:T.sub}}>{p.email}</td>
                      <td onClick={()=>setSelUser(p)} style={{color:T.muted,fontSize:12}}>{p.created_at?p.created_at.slice(0,10):"—"}</td>
                      <td onClick={()=>setSelUser(p)}>{isDeact&&<span style={{fontSize:10,background:isPending?"#FEF3C7":"#fee2e2",color:isPending?T.orange:T.red,padding:"2px 8px",borderRadius:5,fontWeight:700}}>{isPending?"PENDING":"DEACTIVATED"}</span>}</td>
                      <td style={{textAlign:"right"}} onClick={e=>e.stopPropagation()}>
                        {isDeact?(
                          <button onClick={()=>toggleDeactivate(p.id,true)} title={isPending?"Approve this account":"Reactivate this account"} style={{background:T.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{isPending?"Approve":"Activate"}</button>
                        ):(
                          <span onClick={()=>setSelUser(p)} style={{color:T.muted,cursor:"pointer"}}>›</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!shownProfiles.length&&<tr><td colSpan="7" style={{padding:"24px 0",textAlign:"center",color:T.muted}}>{userStatusTab==="active"?"No active users found.":"No deactivated or pending users."}</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {tab==="analytics"&&(()=>{
          const counts={};
          usageEvents.forEach(e=>{counts[e.tab_name]=(counts[e.tab_name]||0)+1;});
          const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
          const maxCount=sorted.length?sorted[0][1]:1;
          const last7=usageEvents.filter(e=>new Date(e.created_at)>=new Date(Date.now()-7*86400000)).length;
          return(
            <div>
              <p style={{fontSize:11,color:T.muted,marginBottom:16}}>Page views across all users, last {usageEvents.length} events logged. Tells you what's actually used, not a full analytics platform.</p>
              {usageLoading?(
                <div style={{textAlign:"center",padding:30,color:T.muted}}>Loading…</div>
              ):(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
                      <div style={{fontSize:12,color:T.sub}}>Total events logged</div>
                      <div style={{fontSize:22,fontWeight:800,color:T.text,marginTop:4}}>{usageEvents.length}</div>
                    </div>
                    <div style={{background:"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:16}}>
                      <div style={{fontSize:12,color:T.sub}}>Views in the last 7 days</div>
                      <div style={{fontSize:22,fontWeight:800,color:T.text,marginTop:4}}>{last7}</div>
                    </div>
                  </div>
                  <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:10}}>Most-viewed screens</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {sorted.map(([name,count])=>(
                      <div key={name} style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:140,fontSize:12,color:T.text,fontWeight:600,flexShrink:0}}>{name}</div>
                        <div style={{flex:1,background:T.bg,borderRadius:6,height:16,overflow:"hidden"}}>
                          <div style={{width:`${(count/maxCount)*100}%`,height:"100%",background:T.accent,borderRadius:6}}/>
                        </div>
                        <div style={{width:40,textAlign:"right",fontSize:12,color:T.muted}}>{count}</div>
                      </div>
                    ))}
                    {!sorted.length&&<div style={{textAlign:"center",padding:30,color:T.muted}}>No usage data yet.</div>}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40}}>
      <BackHeader title="Admin Panel" sub="ADMIN ONLY · FEATURE CONTROL" onBack={onBack}/>
      {/* Tab switcher */}
      <div style={{display:"flex",gap:4,padding:"10px 16px 0",background:"#fff",borderBottom:`1px solid ${T.border}`}}>
        {[["global","🌐 Global"],["users","👤 Per User"],["requests",`📋 Requests${accessRequests.length?` (${accessRequests.length})`:""}`]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 16px",border:"none",background:"none",fontSize:12,fontWeight:tab===id?700:500,color:tab===id?T.accent:T.muted,borderBottom:tab===id?`2px solid ${T.accent}`:"2px solid transparent",cursor:"pointer",fontFamily:"inherit",marginBottom:-1}}>{label}</button>
        ))}
      </div>
      <div style={{padding:16}}>
        {tab==="requests"&&<AccessRequestsPanel accessRequests={accessRequests} requestsLoading={requestsLoading} onApprove={approveRequest} onDismiss={dismissRequest}/>}
        {tab==="global"&&(
          <>
            <div style={{background:T.accentLight,borderRadius:12,padding:"10px 14px",marginBottom:16,border:`1px solid ${T.accentMid}`}}>
              <div style={{fontSize:12,color:T.accent,fontWeight:600}}>Global toggles apply to all users. Per-user overrides in the Users tab.</div>
            </div>
            {ADMIN_FEATURES.map(f=>(
              <div key={f.id} style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:22,flexShrink:0}}>{f.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{f.label}</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:1}}>{f.desc}</div>
                </div>
                <Toggle on={isGlobalOn(f.id)} onClick={()=>toggleGlobal(f.id)}/>
              </div>
            ))}
          </>
        )}
        {tab==="users"&&(()=>{
          const activeProfiles=filteredProfiles.filter(p=>p.is_active!==false);
          const inactiveProfiles=filteredProfiles.filter(p=>p.is_active===false);
          const shownProfiles=userStatusTab==="active"?activeProfiles:inactiveProfiles;
          return(
            <>
              <div style={{position:"relative",marginBottom:10}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted}}>🔍</span>
                <input placeholder="Search by name or email..." value={search||""} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:38}}/>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                {[["active","✅ Active ("+activeProfiles.length+")"],["inactive","🚫 Inactive / Pending ("+inactiveProfiles.length+")"]].map(([id,label])=>(
                  <button key={id} onClick={()=>setUserStatusTab(id)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid "+(userStatusTab===id?T.accent:T.border),background:userStatusTab===id?T.accent:"#fff",color:userStatusTab===id?"#fff":T.sub,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
                ))}
              </div>
              {shownProfiles.length?(
                <div>
                  {shownProfiles.map((p)=>{
                    const isDeact=p.is_active===false;
                    const realIdx=profiles.findIndex(x=>x.id===p.id);
                    return(
                      <div key={p.id} onClick={()=>setSelUser(p)} style={{background:isDeact?"#fff8f8":T.card,borderRadius:12,border:"1.5px solid "+(isDeact?T.red:T.border),padding:"12px 14px",marginBottom:6,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:isDeact?"#e5e7eb":T.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:800,flexShrink:0}}>
                          {isDeact?"🚫":"#"+(realIdx+1)}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.display_name||p.email||"User"}</div>
                          <div style={{fontSize:10,color:T.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.email}</div>
                        </div>
                        {p.is_admin&&<span style={{fontSize:9,background:"#EDE9FE",color:"#7C3AED",padding:"2px 7px",borderRadius:5,fontWeight:800,flexShrink:0}}>ADMIN</span>}
                        {isDeact?(
                          <button onClick={e=>{e.stopPropagation();toggleDeactivate(p.id,true);}} style={{background:T.green,color:"#fff",border:"none",borderRadius:7,padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Activate</button>
                        ):(
                          <span style={{fontSize:16,color:T.muted}}>›</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ):(
                <div style={{fontSize:12,color:T.muted,background:T.bg,borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  {userStatusTab==="active"?"No active users found.":"No deactivated or pending users."}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}


function AIBookkeepingScreen({accounts,contacts,setContacts,addTransaction,nextBilag,inboxFiles,uploadInboxFile,attachFilesToTxnEntry,onBack,isDesktop=false}){
  const[note,setNote]=useState("");
  const[parsing,setParsing]=useState(false);
  const[entries,setEntries]=useState([]);
  const[editModes,setEditModes]=useState({});
  const[approved,setApproved]=useState({});
  const[uidCounter,setUidCounter]=useState(1);
  const[scanning,setScanning]=useState(false);

  // Learning from corrections — a lightweight, honest version: whenever you
  // change a suggested account for a named party, we remember that choice
  // (locally, per device) and feed it back into future prompts so the AI
  // gets better at *your* vendors specifically, not a real ML pipeline.
  const CORRECTIONS_KEY="rr_ai_corrections";
  const getCorrections=()=>{try{return JSON.parse(localStorage.getItem(CORRECTIONS_KEY)||"{}");}catch{return{};}};
  const recordCorrection=(party,accountCode)=>{
    if(!party||!accountCode)return;
    try{
      const c=getCorrections();
      c[party.toLowerCase()]=accountCode;
      localStorage.setItem(CORRECTIONS_KEY,JSON.stringify(c));
    }catch{}
  };
  const correctionsPromptText=()=>{
    const c=getCorrections();
    const keys=Object.keys(c);
    if(!keys.length)return"";
    return`\n\nLEARNED PREFERENCES from your past corrections (use these if the party matches, they override general judgement):\n${keys.map(k=>`"${k}" → account ${c[k]}`).join("\n")}`;
  };

  const fmtPKR=(n)=>new Intl.NumberFormat("en-PK",{style:"currency",currency:"PKR",maximumFractionDigits:0}).format(Math.abs(n));

  const EXAMPLES=[
    "Purchased supplies for 18000 — 9000 from Supplier A, 5000 from Supplier B and 4000 cash.",
    "Received 25000 from Customer A for the completed project.",
    "Paid this month's salary 80000 via bank and rent 25000 cash.",
  ];

  const parseNote=async()=>{
    if(!note.trim())return;
    setParsing(true);
    const today=new Date().toISOString().split("T")[0];
    const accountList=accounts.map(a=>`${a.code} — ${a.name}`).join("\n");
    const contactList=contacts.map(c=>`${c.id} | ${c.name} | ${c.type} | account: ${c.type==="supplier"?"2400 Accounts Payable":"1500 Accounts Receivable"}`).join("\n");
    const prompt=`You are a Pakistani bookkeeping assistant using double-entry accounting. Parse the user's note into journal entries.

CONTACTS — match names to these first:
${contactList}

ACCOUNTS:
${accountList}

RULES:
1. Always look up person names in CONTACTS first.
   - SUPPLIER contact → use 2400 Accounts Payable for their line
   - CUSTOMER contact → use 1500 Accounts Receivable for their line
   - Unknown person → pick best account from context, mark contact_id as ""

2. For PURCHASES (you buy something):
   - Dr the expense/asset account for the total
   - Cr one line per person involved:
     * Supplier contact → Cr 2400 AP (you owe them)
     * Customer contact → Cr 1500 AR (unusual but follow contacts)
     * No contact found → Cr 1001 Cash or 2400 AP based on context

3. For RECEIVING MONEY:
   - Dr Cash/Bank
   - Cr 1500 AR (if customer paying invoice) or Cr 3000s Income

4. For PAYING (salary, bills, suppliers):
   - Dr Expense account
   - Cr Cash/Bank or AP

5. Split amounts: one Dr line total, multiple Cr lines per person.
   Sum of Dr lines must equal sum of Cr lines exactly.

6. unknown_parties: list any names not found in contacts.

Return ONLY valid JSON, no markdown:
{"entries":[{"id":1,"description":"short description","date":"${today}","reasoning":"how contacts determined accounts","unknown_parties":[],"lines":[{"type":"Dr","account_code":"4001","account_name":"Rent","party":"","contact_id":"","amount":18000},{"type":"Cr","account_code":"2400","account_name":"Accounts Payable","party":"Supplier A","contact_id":"S001","amount":9000}]}]}${correctionsPromptText()}

User note: ${note.trim()}`;
    try{
      const{data,error}=await callClaudeAPI({model:"claude-sonnet-4-6",max_tokens:1200,messages:[{role:"user",content:prompt}]});
      if(error==="NO_KEY"){alert("Add your Anthropic API key in Company → Settings to use AI bookkeeping.");return;}
      if(error){alert("AI bookkeeping request failed: "+error);return;}
      const text=data.content.map(b=>b.text||"").join("");
      const clean=text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      let uid=uidCounter;
      const newEntries=parsed.entries.map(e=>({...e,_uid:uid++}));
      setUidCounter(uid);
      setEntries(p=>[...p,...newEntries]);
    }catch(err){
      alert("Could not parse note. Try rephrasing.");
    }
    setParsing(false);
  };

  // OCR / snap-receipt — sends the photo itself to Claude's vision-capable
  // API (same fetch pattern as text parsing above), asking it to read the
  // vendor, date, and amount directly off the receipt. Uploads the photo to
  // the Inbox immediately so it can be attached to the entry once approved.
  const parseReceiptImage=async(file)=>{
    setScanning(true);
    try{
      const reader=new FileReader();
      const base64=await new Promise((resolve,reject)=>{
        reader.onload=()=>resolve(reader.result.split(",")[1]);
        reader.onerror=reject;
        reader.readAsDataURL(file);
      });
      const today=new Date().toISOString().split("T")[0];
      const accountList=accounts.map(a=>`${a.code} — ${a.name}`).join("\n");
      const contactList=contacts.map(c=>`${c.id} | ${c.name} | ${c.type} | account: ${c.type==="supplier"?"2400 Accounts Payable":"1500 Accounts Receivable"}`).join("\n");
      const prompt=`You are a Pakistani bookkeeping assistant. This image is a photo of a receipt or invoice. Read the vendor name, date, total amount, and what was purchased, then create a double-entry journal entry for it.

CONTACTS — match the vendor name to these first:
${contactList}

ACCOUNTS:
${accountList}

RULES:
1. Dr the expense account matching what was purchased, for the total amount on the receipt.
2. Cr 2400 Accounts Payable if the vendor is a known supplier contact; otherwise Cr 1001 Cash (assume paid in cash unless the receipt clearly shows a bank/card payment, in which case use the relevant bank account if one matches by name).
3. If the vendor isn't in CONTACTS, list their name in unknown_parties and leave contact_id "".
4. Use the date printed on the receipt if legible; otherwise use ${today}.${correctionsPromptText()}

Return ONLY valid JSON, no markdown:
{"entries":[{"id":1,"description":"short description of purchase and vendor","date":"YYYY-MM-DD","reasoning":"what you read off the receipt","unknown_parties":[],"lines":[{"type":"Dr","account_code":"4001","account_name":"...","party":"","contact_id":"","amount":0},{"type":"Cr","account_code":"1001","account_name":"Cash","party":"vendor name if known","contact_id":"","amount":0}]}]}`;
      const{data,error}=await callClaudeAPI({
        model:"claude-sonnet-4-6",max_tokens:1200,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:base64}},
          {type:"text",text:prompt},
        ]}],
      });
      if(error==="NO_KEY"){alert("Add your Anthropic API key in Company → Settings to use AI bookkeeping.");return;}
      if(error){alert("AI bookkeeping request failed: "+error);return;}
      const text=data.content.map(b=>b.text||"").join("");
      const clean=text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const newFile=uploadInboxFile?await uploadInboxFile(file):null;
      let uid=uidCounter;
      const newEntries=parsed.entries.map(e=>({...e,_uid:uid++,_attachmentId:newFile?newFile.id:null}));
      setUidCounter(uid);
      setEntries(p=>[...p,...newEntries]);
    }catch(err){
      alert("Could not read that receipt clearly. Try a clearer photo, or type the entry instead.");
    }
    setScanning(false);
  };

  const nextContactId=(type,currentContacts)=>{
    const prefix=type==="customer"?"C":"S";
    const nums=currentContacts.filter(c=>c.type===type).map(c=>parseInt(c.id.slice(1))||0);
    return prefix+String((nums.length?Math.max(...nums):0)+1).padStart(3,"0");
  };

  const addUnknownContact=(uid,name,type)=>{
    const newId=nextContactId(type,contacts);
    const newContact={id:newId,type,name,notes:""};
    setContacts([...contacts,newContact]);
    setEntries(prev=>prev.map(e=>{
      if(e._uid!==uid)return e;
      const newUnknown=(e.unknown_parties||[]).filter(n=>n!==name);
      const newLines=e.lines.map(l=>{
        if(l.party===name&&!l.contact_id){
          return{...l,contact_id:newId,account_code:type==="supplier"?"2400":"1500",account_name:type==="supplier"?"Accounts Payable":"Accounts Receivable"};
        }
        return l;
      });
      return{...e,unknown_parties:newUnknown,lines:newLines};
    }));
  };

  const toggleEdit=uid=>setEditModes(p=>({...p,[uid]:!p[uid]}));

  const updateLine=(uid,li,field,val)=>{
    setEntries(p=>p.map(e=>{
      if(e._uid!==uid)return e;
      const lines=[...e.lines];
      lines[li]={...lines[li],[field]:field==="amount"?(parseFloat(val)||0):val};
      if(field==="account_code"&&lines[li].party)recordCorrection(lines[li].party,val);
      return{...e,lines};
    }));
  };

  const updateEntryField=(uid,field,val)=>{
    setEntries(p=>p.map(e=>e._uid===uid?{...e,[field]:val}:e));
  };

  const discardEntry=uid=>{
    setEntries(p=>p.filter(e=>e._uid!==uid));
    setEditModes(p=>{const n={...p};delete n[uid];return n;});
    setApproved(p=>{const n={...p};delete n[uid];return n;});
  };

  const approveEntry=uid=>{
    const e=entries.find(x=>x._uid===uid);
    if(!e)return;
    const totalDr=e.lines.filter(l=>l.type==="Dr").reduce((s,l)=>s+l.amount,0);
    const totalCr=e.lines.filter(l=>l.type==="Cr").reduce((s,l)=>s+l.amount,0);
    if(Math.abs(totalDr-totalCr)>=1)return;
    const drLines=e.lines.filter(l=>l.type==="Dr");
    const crLines=e.lines.filter(l=>l.type==="Cr");
    if(drLines.length===1&&crLines.length===1){
      addTransaction({date:e.date,description:e.description,debitCode:drLines[0].account_code,creditCode:crLines[0].account_code,amount:drLines[0].amount,contactId:crLines[0].contact_id||drLines[0].contact_id||undefined,attachmentId:e._attachmentId||undefined});
    } else {
      e.lines.forEach((line,idx)=>{
        const paired=e.lines.find(l=>l.type!==(line.type==="Dr"?"Dr":"Cr"));
        addTransaction({date:e.date,description:`${e.description}${line.party?" — "+line.party:""}`,debitCode:line.type==="Dr"?line.account_code:(paired?paired.account_code:"1001"),creditCode:line.type==="Cr"?line.account_code:(paired?paired.account_code:"1001"),amount:line.amount,contactId:line.contact_id||undefined,attachmentId:idx===0?(e._attachmentId||undefined):undefined});
      });
    }
    setApproved(p=>({...p,[uid]:true}));
    setEditModes(p=>({...p,[uid]:false}));
  };

  return(
    <div style={isDesktop?{}:{background:T.bg,minHeight:"100vh",fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:90}}>
      {!isDesktop&&<BackHeader title="AI Bookkeeping" sub="SMART ENTRY PARSER" color={T.accent} onBack={onBack}/>}
      {isDesktop&&<h1 style={{fontSize:20,fontWeight:800,color:T.text,margin:"0 0 16px"}}>AI Bookkeeping</h1>}
      <div style={{padding:isDesktop?0:16}}>
        <div style={{background:T.accentLight,borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:T.accent,lineHeight:1.7}}>
          <b>How it works:</b> Type your transaction in plain language. The AI looks up your contacts to determine whether to post to AP (supplier) or AR (customer), then creates a double-entry for your review.
        </div>

        <SL>Transaction Note</SL>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={"e.g. Purchased supplies for 18000 — 9000 from Supplier A, 5000 from Supplier B and 4000 cash."} style={{...inp,minHeight:80,resize:"vertical",lineHeight:1.6,fontSize:14}}/>

        <div style={{display:"flex",flexWrap:"wrap",gap:6,margin:"8px 0 12px"}}>
          {EXAMPLES.map((ex,i)=>(
            <button key={i} onClick={()=>setNote(ex)} style={{padding:"4px 12px",background:T.card,border:`1px solid ${T.border}`,borderRadius:20,fontSize:11,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Example {i+1}</button>
          ))}
        </div>

        <button onClick={parseNote} disabled={parsing||!note.trim()} style={{...btnRed,marginBottom:12,opacity:parsing||!note.trim()?0.5:1}}>
          {parsing?"⏳ AI is reading your note...":"✨ Parse with AI"}
        </button>

        <div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0 20px"}}>
          <div style={{flex:1,height:1,background:T.border}}/>
          <span style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase"}}>or</span>
          <div style={{flex:1,height:1,background:T.border}}/>
        </div>

        <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:scanning?T.border:T.accentLight,color:scanning?T.muted:T.accent,border:`1.5px dashed ${scanning?T.border:T.accent}`,borderRadius:12,padding:"16px",marginBottom:20,cursor:scanning?"wait":"pointer",fontWeight:700,fontSize:13}}>
          {scanning?"📷 Reading receipt…":"📷 Snap or upload a receipt"}
          <input type="file" accept="image/*" capture="environment" disabled={scanning} style={{display:"none"}} onChange={e=>{if(e.target.files[0])parseReceiptImage(e.target.files[0]);e.target.value="";}}/>
        </label>

        <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"10px 14px",marginBottom:16,fontSize:11,color:T.sub}}>
          <b style={{color:T.text}}>Your Contacts ({contacts.length})</b>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
            {contacts.map(c=>(
              <span key={c.id} style={{fontSize:10,padding:"2px 8px",borderRadius:5,background:c.type==="supplier"?T.redLight:T.blueBg,color:c.type==="supplier"?T.red:T.blue,fontWeight:700}}>{c.name} ({c.type==="supplier"?"AP":"AR"})</span>
            ))}
          </div>
        </div>

        {entries.length>0&&<SL mt={4}>Parsed Entries — Review Before Approving</SL>}

        {entries.map(e=>{
          const uid=e._uid;
          const isApproved=approved[uid];
          const isEditing=editModes[uid];
          const totalDr=e.lines.filter(l=>l.type==="Dr").reduce((s,l)=>s+l.amount,0);
          const totalCr=e.lines.filter(l=>l.type==="Cr").reduce((s,l)=>s+l.amount,0);
          const balanced=Math.abs(totalDr-totalCr)<1;
          return(
            <div key={uid} style={{background:T.card,borderRadius:14,border:`1px solid ${isApproved?"#86efac":T.border}`,padding:"14px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{flex:1}}>
                  {isEditing?(
                    <input value={e.description} onChange={ev=>updateEntryField(uid,"description",ev.target.value)} style={{...inp,fontSize:14,fontWeight:700,marginBottom:6}}/>
                  ):(
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>{e.description}</div>
                  )}
                  {isEditing?(
                    <input type="date" value={e.date} onChange={ev=>updateEntryField(uid,"date",ev.target.value)} style={{...inp,fontSize:12,width:"auto"}}/>
                  ):(
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>{e.date}</div>
                  )}
                </div>
                <span style={{fontSize:10,fontWeight:800,padding:"3px 10px",borderRadius:20,background:isApproved?"#dcfce7":T.orangeBg,color:isApproved?T.green:T.orange,marginLeft:8,whiteSpace:"nowrap"}}>{isApproved?"✓ Approved":"Pending Review"}</span>
              </div>

              {e.reasoning&&!isApproved&&(
                <div style={{background:T.accentLight,borderRadius:8,padding:"7px 10px",fontSize:11,color:T.accent,marginBottom:10,lineHeight:1.5}}>💡 {e.reasoning}</div>
              )}
              {e.unknown_parties&&e.unknown_parties.length>0&&(
                <div style={{background:T.orangeBg,borderRadius:12,padding:"10px 14px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.orange,marginBottom:8}}>⚠️ Unknown contacts — who are these people?</div>
                  {e.unknown_parties.map(name=>(
                    <div key={name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderTop:"1px solid rgba(180,83,9,0.15)"}}>
                      <span style={{fontSize:13,fontWeight:600,color:T.text}}>{name}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>addUnknownContact(uid,name,"supplier")} style={{background:T.redLight,color:T.red,border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Supplier (AP)</button>
                        <button onClick={()=>addUnknownContact(uid,name,"customer")} style={{background:T.blueBg,color:T.blue,border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Customer (AR)</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:10}}>
                <div style={{display:"grid",gridTemplateColumns:"44px 1fr 90px",background:T.bg,padding:"6px 10px",borderBottom:`1px solid ${T.border}`}}>
                  {["Type","Account / Party","Amount"].map((h,i)=>(
                    <div key={h} style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",textAlign:i===2?"right":"left"}}>{h}</div>
                  ))}
                </div>
                {e.lines.map((line,li)=>{
                  const contact=contacts.find(c=>c.id===line.contact_id);
                  if(isEditing){
                    return(
                      <div key={li} style={{padding:"8px 10px",borderBottom:li<e.lines.length-1?`1px solid ${T.border}`:"none",display:"grid",gridTemplateColumns:"44px 1fr 90px",gap:6,alignItems:"center"}}>
                        <select value={line.type} onChange={ev=>updateLine(uid,li,"type",ev.target.value)} style={{...inp,padding:"4px 6px",fontSize:11}}>
                          <option value="Dr">Dr</option>
                          <option value="Cr">Cr</option>
                        </select>
                        <div>
                          <AccDrop value={line.account_code} onChange={code=>{const acc=accounts.find(a=>a.code===code);updateLine(uid,li,"account_code",code);if(acc)updateLine(uid,li,"account_name",acc.name);}} accounts={accounts}/>
                          <input value={line.party||""} placeholder="Party name" onChange={ev=>updateLine(uid,li,"party",ev.target.value)} style={{...inp,padding:"4px 6px",fontSize:11,marginTop:4}}/>
                        </div>
                        <input type="number" value={line.amount} onChange={ev=>updateLine(uid,li,"amount",ev.target.value)} style={{...inp,padding:"4px 6px",fontSize:12,textAlign:"right"}}/>
                      </div>
                    );
                  }
                  return(
                    <div key={li} style={{padding:"9px 10px",borderBottom:li<e.lines.length-1?`1px solid ${T.border}`:"none",display:"grid",gridTemplateColumns:"44px 1fr 90px",alignItems:"center",background:line.type==="Dr"?"#fff5f5":"#f0fdf4"}}>
                      <span style={{fontSize:11,fontWeight:800,padding:"2px 7px",borderRadius:5,background:line.type==="Dr"?T.redLight:T.greenBg,color:line.type==="Dr"?T.red:T.green,display:"inline-block",width:"fit-content"}}>{line.type}</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:T.text}}>{line.account_code} — {line.account_name}</div>
                        {line.party&&(
                          <div style={{fontSize:10,marginTop:2}}>
                            <span style={{color:T.muted}}>{line.party} </span>
                            {contact&&<span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4,background:contact.type==="supplier"?T.redLight:T.blueBg,color:contact.type==="supplier"?T.red:T.blue}}>{contact.id}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:13,fontWeight:800,textAlign:"right",color:T.text}}>{fmtPKR(line.amount)}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:T.sub,marginBottom:10,padding:"0 4px"}}>
                <span>Total</span>
                <span style={{fontWeight:700,color:balanced?T.green:T.red}}>{fmtPKR(totalDr)} {balanced?"✓ Balanced":`⚠ Dr≠Cr (diff ${fmtPKR(Math.abs(totalDr-totalCr))})`}</span>
              </div>

              {isApproved?(
                <div style={{background:T.greenBg,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.green,fontWeight:700,textAlign:"center"}}>✓ Entry posted to ledger</div>
              ):(
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>approveEntry(uid)} disabled={!balanced} style={{...btnRed,flex:2,opacity:balanced?1:0.4,padding:"10px"}}>✓ Approve</button>
                  <button onClick={()=>toggleEdit(uid)} style={{...btnGhost,flex:1,padding:"10px"}}>{isEditing?"Done":"Edit"}</button>
                  <button onClick={()=>discardEntry(uid)} style={{background:T.bg,color:T.muted,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:14}}>🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MENU=[
  {id:"Dashboard",icon:"🏠",label:"Home"},
  {id:"Accounts",icon:"📒",label:"Ledger"},
  {id:"Transactions",icon:"+",label:"",isNew:true},
  {id:"Entries",icon:"☰",label:"Entries"},
  {id:"Profile",icon:"👤",label:"Profile"},
];

const SIDEBAR=[
  {id:"Dashboard",icon:"🏠",label:"Home",group:"main"},
  {id:"Files",icon:"📥",label:"Inbox",group:"main"},
  {id:"Entries",icon:"☰",label:"All Entries",group:"main"},
  {id:"Import",icon:"📥",label:"Import Excel",group:"main"},
  {id:"Accounts",icon:"📒",label:"Ledger",group:"main"},
  {id:"Bank",icon:"🏧",label:"Bank",group:"main"},
  {id:"Reskontro",icon:"👥",label:"Customer/Supplier Ledger",group:"main"},
  {id:"SinkingFunds",icon:"🎯",label:"Sinking Funds",group:"tools"},
  {id:"Budget",icon:"📐",label:"Budget",group:"tools"},
  {id:"Reports",icon:"📊",label:"Reports",group:"tools"},
  {id:"AIBookkeeping",icon:"🤖",label:"AI Bookkeeping",group:"tools"},
  {id:"Settings",icon:"⚙️",label:"Settings",group:"system"},
  {id:"AdminPanel",icon:"🛡️",label:"Admin Panel",group:"system"},
  {id:"BugLog",icon:"🐛",label:"Bug Log",group:"system"},
  {id:"AuditLog",icon:"📜",label:"Audit Trail",group:"system"},
];

// ─── Root ─────────────────────────────────────────────────────────────────────


export { AdminPanel, AIBookkeepingScreen, MENU, SIDEBAR };
