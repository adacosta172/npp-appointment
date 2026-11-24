'use strict';
// Only the account explicitly nominated by the project operator can bootstrap.
// Email addresses, client fields and display names never grant staff privileges.
const ADMIN_UID='kDri8qdUjfT1IV9lB6oft5hZuno2';
function bootstrapRole({uid,profile,completed,token}) {
  if(uid!==ADMIN_UID || completed || profile?.active===false || token?.firebase?.sign_in_provider!=='password') return null;
  return {role:profile?.role==='super'?'super':'admin',authority:['super','admin'].includes(profile?.role)&&profile?.authority===true};
}
module.exports={ADMIN_UID,bootstrapRole};
