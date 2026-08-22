import { useState } from "react";
import { T } from "../../lib/theme.js";
import MobileScreen from "./MobileScreen.jsx";

const Field=({label,children})=>(
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,color:"#8A93A3",fontWeight:600,marginBottom:5}}>{label}</div>
    {children}
  </div>
);
const inputStyle={width:"100%",background:"#F6F8FA",border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",fontSize:16,fontFamily:"inherit",boxSizing:"border-box"};

export default function MobileCompanyProfile({companyProfile,saveCompanyProfile,onClose}){
  const[form,setForm]=useState(companyProfile);
  const[saved,setSaved]=useState(false);
  const[showMore,setShowMore]=useState(false);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const save=()=>{saveCompanyProfile(form);setSaved(true);setTimeout(()=>setSaved(false),1500);};

  return(
    <MobileScreen title="Company profile" subtitle="Used on invoices, reports & settings" onClose={onClose}>
      <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 6px rgba(20,40,50,0.05)"}}>
        <Field label="Company name"><input value={form.companyName||""} onChange={set("companyName")} style={inputStyle}/></Field>
        <Field label="Address"><input value={form.address||""} onChange={set("address")} style={inputStyle}/></Field>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><Field label="City"><input value={form.city||""} onChange={set("city")} style={inputStyle}/></Field></div>
          <div style={{flex:1}}><Field label="Postcode"><input value={form.postcode||""} onChange={set("postcode")} style={inputStyle}/></Field></div>
        </div>
        <Field label="Mobile number"><input value={form.mobile||""} onChange={set("mobile")} style={inputStyle}/></Field>
        <Field label="Email address"><input type="email" value={form.email||""} onChange={set("email")} style={inputStyle}/></Field>
        <Field label="Organisation number"><input value={form.orgNumber||""} onChange={set("orgNumber")} style={inputStyle}/></Field>

        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <Field label="Country">
              <select value={form.country||"PK"} onChange={e=>{const country=e.target.value;setForm(p=>({...p,country,currency:country==="NO"?"NOK":"PKR"}));}} style={inputStyle}>
                <option value="PK">Pakistan</option>
                <option value="NO">Norway</option>
              </select>
            </Field>
          </div>
          <div style={{flex:1}}>
            <Field label="Currency">
              <select value={form.currency||"PKR"} onChange={set("currency")} style={inputStyle}>
                <option>PKR</option><option>NOK</option><option>USD</option><option>EUR</option><option>GBP</option>
              </select>
            </Field>
          </div>
        </div>

        {!showMore?(
          <div onClick={()=>setShowMore(true)} style={{textAlign:"center",padding:"10px",color:T.accent,fontWeight:700,fontSize:12.5}}>Show more fields</div>
        ):(
          <>
            <Field label="Telephone number"><input value={form.phone||""} onChange={set("phone")} style={inputStyle}/></Field>
            <Field label="Fax number"><input value={form.faxNumber||""} onChange={set("faxNumber")} style={inputStyle}/></Field>
            <Field label="Website"><input value={form.website||""} onChange={set("website")} style={inputStyle}/></Field>
            <Field label="Bank account (for invoices)"><input value={form.bankAccount||""} onChange={set("bankAccount")} style={inputStyle}/></Field>
            <Field label="Default VAT %"><input type="number" value={form.vatPct||0} onChange={e=>setForm(p=>({...p,vatPct:parseFloat(e.target.value)||0}))} style={inputStyle}/></Field>
            <Field label="Form of business organization">
              <select value={form.formOfBusiness||""} onChange={set("formOfBusiness")} style={inputStyle}>
                <option value="">—</option>
                <option>Sole proprietorship</option>
                <option>Partnership</option>
                <option>Private limited company</option>
                <option>Public limited company</option>
                <option>Non-profit / NGO</option>
              </select>
            </Field>
            <Field label="Fiscal year starts">
              <select value={form.fiscalYearStartMonth||1} onChange={e=>setForm(p=>({...p,fiscalYearStartMonth:parseInt(e.target.value)}))} style={inputStyle}>
                {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Language">
              <select value={form.language||"English"} onChange={set("language")} style={inputStyle}>
                <option>English</option><option>Norwegian</option><option>Urdu</option>
              </select>
            </Field>
          </>
        )}

        <div onClick={save} style={{marginTop:6,textAlign:"center",padding:"13px",borderRadius:12,background:saved?"#0E9F6E":T.accent,color:"#fff",fontWeight:700,fontSize:13.5}}>{saved?"✓ Saved":"Save"}</div>
      </div>
    </MobileScreen>
  );
}
