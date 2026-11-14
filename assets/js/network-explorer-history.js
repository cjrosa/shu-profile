(function(root){'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const equal=(a,b)=>JSON.stringify({data:a.data,candidate:a.candidate})===JSON.stringify({data:b.data,candidate:b.candidate});
 class History{
  constructor(limit=100){this.limit=limit;this.past=[];this.future=[];this.group=null;}
  breakGroup(){this.group=null;}
  record(before,after,label='Edit network',group=null){if(equal(before,after))return false;const last=this.past.at(-1);if(group&&this.group===group&&last){last.after=copy(after);if(equal(last.before,last.after))this.past.pop();}else{this.past.push({before:copy(before),after:copy(after),label});if(this.past.length>this.limit)this.past.shift();}this.future=[];this.group=group;return true;}
  undo(){const step=this.past.pop();if(!step)return null;this.future.push(step);this.breakGroup();return copy(step.before);}
  redo(){const step=this.future.pop();if(!step)return null;this.past.push(step);this.breakGroup();return copy(step.after);}
 }
 const api={History};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this);
