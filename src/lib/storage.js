import { sb, getCurrentUserId } from "./supabaseClient.js";

const sanitizeFilename=(name)=>String(name||"file").replace(/[^a-zA-Z0-9._-]/g,"_");
const uploadFileToStorage=async(file)=>{
  const path=`${getCurrentUserId()}/${Date.now()}_${sanitizeFilename(file.name||"file")}`;
  const{error}=await sb.storage.from("attachments").upload(path,file,{contentType:file.type||undefined});
  if(error)throw error;
  return path;
};
// Stepping through several candidate documents (the "N of M" prev/next in
// New voucher, or the Inbox preview) re-requested a brand-new signed URL
// from Supabase on every single switch — including flipping BACK to a file
// already viewed a moment ago — which is what made "reloading" a file feel
// slow. A signed URL is valid for the full `expiresIn` window regardless of
// how many times it's used, so caching it in memory for that window (minus
// a safety margin, so a link is never served right at the edge of actually
// expiring) turns every repeat view in the same browsing session into an
// instant cache hit with no network round trip at all. Cleared on reload,
// which is fine — it only exists to avoid refetching within one session.
const signedUrlCache=new Map(); // storagePath -> {url, expiresAt}
const getSignedUrl=async(storagePath,expiresIn=3600)=>{
  if(!storagePath)return null;
  const cached=signedUrlCache.get(storagePath);
  if(cached&&cached.expiresAt>Date.now())return cached.url;
  const{data,error}=await sb.storage.from("attachments").createSignedUrl(storagePath,expiresIn);
  if(error){console.error("Signed URL error:",error);return null;}
  const url=(data&&data.signedUrl)||null;
  if(url)signedUrlCache.set(storagePath,{url,expiresAt:Date.now()+Math.max(0,expiresIn-300)*1000});
  return url;
};
const deleteFileFromStorage=async(storagePath)=>{
  if(!storagePath)return;
  try{await sb.storage.from("attachments").remove([storagePath]);}catch(e){console.error("Storage delete error:",e);}
};

export { sanitizeFilename, uploadFileToStorage, getSignedUrl, deleteFileFromStorage };
