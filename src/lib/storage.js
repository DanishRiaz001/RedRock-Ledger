import { sb, getCurrentUserId } from "./supabaseClient.js";

const sanitizeFilename=(name)=>String(name||"file").replace(/[^a-zA-Z0-9._-]/g,"_");
const uploadFileToStorage=async(file)=>{
  const path=`${getCurrentUserId()}/${Date.now()}_${sanitizeFilename(file.name||"file")}`;
  const{error}=await sb.storage.from("attachments").upload(path,file,{contentType:file.type||undefined});
  if(error)throw error;
  return path;
};
const getSignedUrl=async(storagePath,expiresIn=3600)=>{
  if(!storagePath)return null;
  const{data,error}=await sb.storage.from("attachments").createSignedUrl(storagePath,expiresIn);
  if(error){console.error("Signed URL error:",error);return null;}
  return(data&&data.signedUrl)||null;
};
const deleteFileFromStorage=async(storagePath)=>{
  if(!storagePath)return;
  try{await sb.storage.from("attachments").remove([storagePath]);}catch(e){console.error("Storage delete error:",e);}
};

export { sanitizeFilename, uploadFileToStorage, getSignedUrl, deleteFileFromStorage };
