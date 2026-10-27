window.TCPScenarios=[
 {name:'Three-Way Handshake',objective:'Connect, then step through SYN, SYN-ACK, and ACK. Data readings stay pending until established.',config:{}},
 {name:'Basic SEQ/ACK',objective:'Send Data submits to TCP. Send Segment transmits it. Deliver data, then its ACK; the receiver application has not read it.',config:{size:4}},
 {name:'MSS Segmentation',objective:'A 10-byte message with MSS 4 splits into 4 + 4 + 2. Deliver an ACK to make room for the final segment.',config:{size:10}},
 {name:'Sliding Window',objective:'Submit data, send twice, and deliver the ACKs. SND.UNA advances and the fixed teaching window slides. Application reads are independent.',config:{}},
 {name:'Window Full',objective:'Send two 4-byte segments to fill the teaching window. Deliver an ACK to make room for another segment.',config:{}},
 {name:'Packet Loss',objective:'The middle segment is lost. Deliver the later segment, then retransmit the gap. Watch cumulative ACK and buffered bytes.',config:{size:12,windowSize:12},setup:'loss'},
 {name:'Cumulative ACK',objective:'Deliver bytes 50–53 beyond the gap at 46. Retransmit 46–49 to let RCV.NXT jump to 54.',config:{size:12,windowSize:12},setup:'loss'},
 {name:'Application vs TCP ACK',objective:'Four bytes are already acknowledged but unread. Read Data moves them from TCP into the application.',config:{size:4},setup:'acknowledged'},
 {name:'Full Duplex Exchange',objective:'Both applications have submitted data. Send a segment from each TCP to observe independent sequence spaces.',config:{duplex:true},setup:'submitted'},
 {name:'Piggybacked ACK',objective:'B has received A’s four bytes. Send Segment at B: SEQ=79 carries six bytes while ACK=46 acknowledges A.',config:{duplex:true,mssB:6},setup:'piggyback'}
];
