(function(root){
  'use strict';
  const common=[
    {key:'sourcePort',label:'Source Port',offset:0,bits:16},
    {key:'destinationPort',label:'Destination Port',offset:2,bits:16}
  ];
  const fields={
    udp:[...common,{key:'length',label:'Length',offset:4,bits:16},{key:'checksum',label:'Checksum',offset:6,bits:16}],
    tcp:[...common,
      {key:'sequence',label:'Sequence Number',offset:4,bits:32},
      {key:'acknowledgment',label:'Acknowledgment Number',offset:8,bits:32},
      {key:'dataOffset',label:'Data Offset',offset:12,bits:4,shift:4,fixed:true},
      {key:'reserved',label:'Reserved',offset:12,bits:4,shift:0,fixed:true},
      {key:'flags',label:'Flags',offset:13,bits:8},
      {key:'window',label:'Window Size',offset:14,bits:16},
      {key:'checksum',label:'Checksum',offset:16,bits:16},
      {key:'urgent',label:'Urgent Pointer',offset:18,bits:16}]
  };
  const defaults={sourcePort:0xfc00,destinationPort:0x0050,length:0x001c,sequence:0x12345678,acknowledgment:0,flags:0x02,window:0x4000,urgent:0,dataOffset:5,reserved:0};
  function metadata(protocol){if(!fields[protocol])throw new Error('Select UDP or TCP.');return fields[protocol];}
  function validateHeader(protocol,bytes){
    metadata(protocol);
    if(!(bytes instanceof Uint8Array)||bytes.length!==(protocol==='udp'?8:20))throw new Error('Expected an 8-byte UDP or 20-byte TCP header.');
  }
  function integer(n,bits,label){if(!Number.isInteger(n)||n<0||n>2**bits-1)throw new Error(`${label} must be an unsigned ${bits}-bit value.`);return n;}
  function parseNumber(text,bits=16,base=16,label='Field'){
    if(![2,10,16].includes(base))throw new Error('Select binary, decimal, or hexadecimal.');
    const textValue=String(text).trim();
    const value=base===10?textValue:textValue.replace(base===2?/^0b/i:/^0x/i,'');
    const valid=base===2?/^[01]+$/:base===10?/^\d+$/:/^[\da-f]+$/i;
    if(!valid.test(value))throw new Error(`${label}: enter ${base===2?'binary':base===10?'decimal':'hexadecimal'} digits.`);
    return integer(parseInt(value,base),bits,label);
  }
  function readField(bytes,field){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return field.bits===32?view.getUint32(field.offset):field.bits===16?view.getUint16(field.offset):field.bits===8?bytes[field.offset]:(bytes[field.offset]>>>field.shift)&15;
  }
  function writeField(bytes,field,value){
    integer(value,field.bits,field.label);
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(field.bits===32)view.setUint32(field.offset,value);
    else if(field.bits===16)view.setUint16(field.offset,value);
    else if(field.bits===8)bytes[field.offset]=value;
    else bytes[field.offset]=(bytes[field.offset]&~(15<<field.shift))|(value<<field.shift);
  }
  function serialize(protocol,values={},checksum=0){
    const bytes=new Uint8Array(protocol==='udp'?8:20);
    for(const field of metadata(protocol))writeField(bytes,field,field.key==='checksum'?checksum:field.fixed?defaults[field.key]:values[field.key]??defaults[field.key]);
    return bytes;
  }
  function edit(protocol,bytes,key,value){
    validateHeader(protocol,bytes);const field=metadata(protocol).find(f=>f.key===key);
    if(!field)throw new Error('Unknown header field.');
    const copy=bytes.slice();writeField(copy,field,value);return copy;
  }
  function words(protocol,bytes){
    validateHeader(protocol,bytes);
    const names=protocol==='udp'?['Source Port','Destination Port','UDP Length','Checksum']:
      ['Source Port','Destination Port','Sequence Number · upper 16','Sequence Number · lower 16','Acknowledgment Number · upper 16','Acknowledgment Number · lower 16','Data Offset + Reserved + Flags','Window Size','Checksum','Urgent Pointer'];
    const checksumOffset=protocol==='udp'?6:16;
    return names.map((label,index)=>({label,index,offset:index*2,value:bytes[index*2]*256+bytes[index*2+1],checksum:index*2===checksumOffset}));
  }
  // Columns are indexed from bit 0 (rightmost) to bit 15. Carry is into each column.
  function binaryAddition(a,b){
    integer(a,16,'First operand');integer(b,16,'Second operand');
    let carry=0,low=0;const columns=[];
    for(let bit=0;bit<16;bit++){
      const x=(a>>>bit)&1,y=(b>>>bit)&1,total=x+y+carry,result=total&1,next=total>>>1;
      columns.push({bit,a:x,b:y,carryIn:carry,total,result,carryOut:next});low|=result<<bit;carry=next;
    }
    return {a,b,columns,low,carry,raw:low+carry*65536};
  }
  function calculate(values){
    let sum=0;
    const steps=values.map(value=>{
      const addition=binaryAddition(sum,value),wrap=addition.carry?binaryAddition(addition.low,1):null;
      const before=sum;sum=wrap?wrap.low:addition.low;
      return {before,word:value,...addition,wrap,sum};
    });
    return {sum,checksum:(~sum)&65535,steps};
  }
  function analyze(protocol,bytes){const sequence=words(protocol,bytes);return {...calculate(sequence.map(w=>w.value)),words:sequence};}
  function complete(protocol,bytes){
    const zeroed=edit(protocol,bytes,'checksum',0),result=analyze(protocol,zeroed);
    // Raw one's complement is intentional: this is header-only arithmetic, not UDP wire semantics.
    return {bytes:edit(protocol,zeroed,'checksum',result.checksum),...result};
  }
  function verify(protocol,bytes){const result=analyze(protocol,bytes);return {...result,valid:result.sum===65535};}
  function flipBit(protocol,bytes,wordIndex,bit){
    validateHeader(protocol,bytes);
    if(!Number.isInteger(wordIndex)||wordIndex<0||wordIndex>=bytes.length/2||!Number.isInteger(bit)||bit<0||bit>15)throw new Error('Choose a header word and a bit from 0 to 15.');
    const copy=bytes.slice(),byte=wordIndex*2+(bit<8?1:0);copy[byte]^=1<<(bit%8);return copy;
  }
  function timeline(result,receiver=false){
    const events=[];
    result.steps.forEach((s,index)=>{
      events.push({kind:'select',index},{kind:'transfer',index},{kind:'loaded',index});
      for(let bit=0;bit<16;bit++)events.push({kind:'add',index,bit});
      events.push({kind:'raw',index});
      if(s.carry){events.push({kind:'wrap',index});for(let bit=0;bit<16;bit++)events.push({kind:'wrapAdd',index,bit});}
      events.push({kind:'promote',index},{kind:'fold',index});
    });
    events.push({kind:'sum'});
    for(let flipped=1;flipped<=16;flipped++)events.push({kind:'invert',flipped});
    events.push({kind:receiver?'verify':'insert'});return events;
  }
  const api={fields,defaults,metadata,parseNumber,readField,serialize,edit,words,binaryAddition,calculate,analyze,complete,verify,flipBit,timeline};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InternetChecksum=api;
})(globalThis);
