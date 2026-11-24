'use strict';
const crypto=require('node:crypto');
const DEADLINE=Date.parse('2026-11-27T00:00:00Z');
const transitions={submitted:['under_review'],under_review:['changes_requested','approved_for_vetting','rejected_before_vetting'],approved_for_vetting:[],vetting_scheduled:['vetted'],vetted:['decision_pending'],decision_pending:['appointed','reserve_list','unsuccessful']};
const final=new Set(['appointed','reserve_list','unsuccessful']);
const staff=r=>r==='admin'||r==='super';
const open=(v,now=Date.now())=>v.published===true && now<DEADLINE && now>=(v.opens||0) && now<=(v.closes||DEADLINE-1);
const reference=()=>`NPP-AEEC-2026-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
const canRead=(actor,a)=>actor.uid===a.uid||(staff(actor.role)&&a.submitted===true)||(actor.role==='panel'&&a.submitted===true&&(a.panel||[]).includes(actor.uid));
const canMove=(actor,from,to)=>staff(actor.role)&&(transitions[from]||[]).includes(to)&&(!final.has(to)||actor.authority===true);
function fileType(b){if(b.length<8)return null;if(b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';return null;}
// The callable API must authenticate independently of the client route.
function accountError(user, token, profile=null) {
  if(!user || !token) return 'unauthenticated';
  if(user.disabled || !user.email || user.emailVerified!==true || token.email_verified!==true) return 'unverified';
  const authTime=token.auth_time, validAfter=Date.parse(user.tokensValidAfterTime || '');
  if(typeof authTime!=='number'||!Number.isFinite(authTime)||(Number.isFinite(validAfter)&&authTime*1000+999<validAfter)) return 'revoked';
  if(profile?.active===false) return 'disabled';
  const role=profile?.role || 'applicant';
  if(!['applicant','admin','super','panel'].includes(role))return 'disabled';
  if(role==='applicant'&&(token.firebase?.sign_in_provider!=='password'||!user.providerData?.some(p=>p.providerId==='password')))return 'password_required';
  if(role!=='applicant'&&!token.firebase?.sign_in_second_factor)return 'mfa_required';
  return null;
}
module.exports={DEADLINE,staff,open,reference,canRead,canMove,fileType,accountError};
