import { doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js';
const SERVER='https://heivoli-discord-auth.heivoli-discord-auth.workers.dev';
export async function networkRequest(auth,route,data) {
  if(!auth.currentUser) throw new Error('Connecte-toi pour continuer.');
  const response=await fetch(`${SERVER}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error||'Connexion refusée.');
  return result;
}
export async function authorizeWrite(auth,db,batch,action,target) {
  const {id}=await networkRequest(auth,'permit',{action,target});
  batch.update(doc(db,'writePermits',id),{usedAt:serverTimestamp()});
  return id;
}
