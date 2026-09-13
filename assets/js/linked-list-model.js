(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
function parse(text){
  if(!text.trim())return [];
  const parts=text.split(',').map(x=>x.trim());
  if(parts.length>10)throw Error('Use at most 10 nodes.');
  if(parts.some(x=>! /^-?\d+$/.test(x)||!Number.isSafeInteger(Number(x))))throw Error('Enter safe integers separated by commas, for example 10, 20, 30.');
  return parts.map(Number);
}
function create(values){return {nodes:values.map((value,i)=>({id:'N'+(i+1),slot:i,value,next:i+1<values.length?'N'+(i+2):null})),head:values.length?'N1':null,tail:values.length?'N'+values.length:null,serial:values.length+1};}
function values(s){const out=[];let id=s.head;while(id){const n=s.nodes.find(n=>n.id===id);out.push(n.value);id=n.next;}return out;}
function trace(base,op,arg,tailEnabled=false){
  const s=copy(base),frames=[],code=[];let current=null,newNode=null,hops=0,writes=0,output=[];
  const node=id=>s.nodes.find(n=>n.id===id);
  const emit=(line,text)=>{let active=code.indexOf(line);if(active<0){active=code.length;code.push(line);}frames.push({state:copy(s),current,newNode,hops,writes,output:[...output],active,text});};
  const size=values(s).length;
  if(op==='index'&&(!Number.isInteger(arg)||arg<0||arg>=size))throw Error('Index must be between 0 and '+(size-1)+'.'+(!size?' Load a nonempty list first.':''));
  if(['prepend','append'].includes(op)){
    if(!Number.isSafeInteger(arg))throw Error('Enter a safe integer value.');
    if(size===10)throw Error('The list already has 10 nodes. Remove the head before adding another.');
  }
  emit('# Start with the current list','References identify nodes; equal values can belong to different nodes.');
  if(op==='traverse'||op==='index'){
    current=s.head;emit('current = self.head','Start at head. No direct index address is available.');
    if(op==='traverse'){
      while(current){emit('while current is not None:','The current reference points to '+current+'.');output.push(node(current).value);emit('    print(current.value)','Visit the value in '+current+'.');current=node(current).next;hops++;emit('    current = current.next','Follow next to '+(current||'None')+'.');}
      emit('while current is not None:','current is None; traversal is complete.');
    }else{
      emit('position = 0','Begin counting at zero.');
      for(let i=0;i<arg;i++){emit('while position < index:','Position '+i+' is before requested index '+arg+'.');current=node(current).next;hops++;emit('    current = current.next','Follow next to '+current+'.');emit('    position += 1','Position is now '+(i+1)+'.');}
      output.push(node(current).value);emit('return current.value','Index '+arg+' contains '+node(current).value+'.');
    }
  }else if(op==='prepend'||op==='append'){
    newNode='N'+s.serial++;let slot=0;while(s.nodes.some(n=>n.slot===slot))slot++;s.nodes.push({id:newNode,slot,value:arg,next:null});emit('new_node = Node(value)','Allocate '+newNode+' with next = None. Existing nodes stay in place.');
    if(op==='prepend'){
      node(newNode).next=s.head;writes++;emit('new_node.next = self.head','Save the old head reference in the new node before changing head.');
      s.head=newNode;writes++;emit('self.head = new_node','Head now points to '+newNode+'.');
      if(!size){s.tail=newNode;if(tailEnabled){writes++;emit('self.tail = new_node','In a one-node list, head and tail point to the same node.');}}
    }else if(!s.head){s.head=newNode;writes++;emit('self.head = new_node','The empty list now has a first node.');s.tail=newNode;if(tailEnabled){writes++;emit('self.tail = new_node','Tail also points to the new node.');}}
    else{
      if(tailEnabled){node(s.tail).next=newNode;writes++;emit('self.tail.next = new_node','The maintained tail reference gives immediate access to the final node.');}
      else{current=s.head;emit('current = self.head','Find the final node by starting at head.');while(node(current).next){emit('while current.next is not None:','There is another node after '+current+'.');current=node(current).next;hops++;emit('    current = current.next','Follow next to '+current+'.');}emit('while current.next is not None:','The final node has next = None.');node(current).next=newNode;writes++;emit('current.next = new_node','Connect the old final node to '+newNode+'.');}
      s.tail=newNode;if(tailEnabled){writes++;emit('self.tail = new_node','Update tail to the new final node.');}
    }
  }else if(op==='remove'){
    emit('if self.head is not None:',s.head?'The list has a head to remove.':'The list is empty; nothing changes.');
    if(s.head){const old=s.head;s.head=node(old).next;writes++;emit('    self.head = self.head.next','Head now points to '+(s.head||'None')+'. '+old+' is detached from the list.');s.nodes=s.nodes.filter(n=>n.id!==old);if(!s.head){s.tail=null;if(tailEnabled){emit('    if self.head is None:','After removing the only node, head is None.');writes++;emit('        self.tail = None','The list is empty, so tail must also be None.');}}}
  }else throw Error('Unknown operation');
  // Keep the internal tail accurate even when the teaching model does not expose it.
  const live=[];let id=s.head;while(id){live.push(id);id=node(id).next;}s.tail=live.at(-1)||null;
  current=null;newNode=null;emit('# Complete','Operation complete. The list is '+(values(s).join(' → ')||'empty')+'.');
  return {frames,code,result:copy(s),complexity:op==='traverse'||op==='index'?'O(n)':op==='append'&&!tailEnabled?'O(n)':'O(1)'};
}
const api={parse,create,values,trace,copy};if(typeof module!=='undefined')module.exports=api;else root.LinkedListModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
