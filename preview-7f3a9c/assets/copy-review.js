import {t as translate, c as refresh, l as language} from './experience-CsT7v0Lg.js';
export * from './experience-CsT7v0Lg.js';
const messages={ru:'Пусть этот подарок станет началом чего-то прекрасного',en:'May this gift be the beginning of something wonderful'};
const defaults=[...Object.values(messages),'Для тебя ✨ Пусть этот подарок станет началом чего-то прекрасного.','For you ✨ May this gift be the beginning of something wonderful.'];
export function t(key){return key==='defaultMessage'?messages[language]:translate(key);}
export function c(){
 const field=document.getElementById('giftMessage'),isDefault=field&&defaults.includes(field.value);
 refresh();if(isDefault)field.value=messages[language];
}
