/* Discrete-event queue model. All times are seconds; playback is handled separately. */
(function (root) {
  'use strict';
  class PacketQueueSimulation {
    constructor(params, random = Math.random, capacity = 20) {
      this.random = random;
      this.baseline = 1500 * 8 / 1e8;
      this.capacity = capacity;
      this.restart(params);
    }
    get length() { return this.queue.length - this.head; }
    restart(params) {
      this.params = {...params};
      this.time = 0;
      this.queue = []; this.head = 0; this.active = null;
      this.arrived = 0; this.transmitted = 0; this.started = 0; this.waitSum = 0;
      this.dropped = 0; this.lastDrop = null;
      this.nextArrival = this.arrivalTime();
      this.burst = null;
      this.lastArrival = null; this.lastDeparture = null;
      this.history = [{time:0, length:0}]; this.nextSample = this.baseline / 2;
      this.markers = [];
    }
    arrivalTime() {
      if (!this.params.arrival) return Infinity;
      const u = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, this.random()));
      return this.time - Math.log1p(-u) / this.params.arrival;
    }
    configure(params, label = 'Parameters changed', manual = true) {
      const arrivalChanged = params.arrival !== this.params.arrival;
      if (manual) this.burst = null;
      this.params = {...params};
      if (arrivalChanged) this.nextArrival = this.arrivalTime();
      this.markers.push({time:this.time, label});
      if (this.markers.length > 100) this.markers.shift();
    }
    startBurst() {
      const restore = this.burst ? this.burst.restore : this.params.arrival;
      this.configure({...this.params, arrival:1.5 * this.params.rate / (this.params.bytes * 8)}, 'Burst starts', false);
      this.burst = {restore, end:this.time + 20 * this.baseline};
    }
    begin(packet) {
      this.active = {...packet, remaining:packet.bits};
      this.started++;
      this.waitSum += this.time - packet.arrival;
    }
    nextEventTime() {
      return Math.min(this.nextArrival,
        this.active ? this.time + this.active.remaining / this.params.rate : Infinity,
        this.burst ? this.burst.end : Infinity);
    }
    moveTo(time) {
      // Sample queue length independently of frame rate and event frequency.
      const earliest = time - 200 * this.baseline;
      if (this.nextSample < earliest) this.nextSample += Math.ceil((earliest - this.nextSample) / (this.baseline / 2)) * (this.baseline / 2);
      let samples = 0;
      while (this.nextSample <= time && samples++ < 402) {
        this.history.push({time:this.nextSample, length:this.length});
        this.nextSample += this.baseline / 2;
      }
      if (this.nextSample <= time) this.nextSample = time + Math.max(this.baseline / 2, Math.abs(time) * Number.EPSILON);
      if (this.active) this.active.remaining = Math.max(0, this.active.remaining - (time - this.time) * this.params.rate);
      this.time = time;
      const cutoff = time - 200 * this.baseline;
      while (this.history.length > 1 && this.history[1].time < cutoff) this.history.shift();
      while (this.markers.length && this.markers[0].time < cutoff) this.markers.shift();
    }
    processEvent() {
      const completion = this.active ? this.time + this.active.remaining / this.params.rate : Infinity;
      const next = this.nextEventTime();
      if (!Number.isFinite(next)) return false;
      this.moveTo(next);
      // At coincident times, restore a burst first, then serve a departure before an arrival.
      if (this.burst && next === this.burst.end) {
        const restore = this.burst.restore;
        this.burst = null;
        this.configure({...this.params, arrival:restore}, 'Burst ends', false);
      } else if (next === completion) {
        this.transmitted++;
        this.lastDeparture = {time:this.time, id:this.active.id};
        this.active = null;
        if (this.length) {
          this.begin(this.queue[this.head++]);
          if (this.head > 4096 && this.head * 2 > this.queue.length) {
            this.queue = this.queue.slice(this.head); this.head = 0;
          }
        }
      } else {
        const packet = {id:++this.arrived, arrival:this.time, bits:this.params.bytes * 8};
        this.lastArrival = {time:this.time, id:packet.id};
        if (!this.active) this.begin(packet);
        else if (this.length < this.capacity) this.queue.push(packet);
        else {
          this.dropped++;
          this.lastDrop = {time:this.time, id:packet.id};
        }
        this.nextArrival = this.arrivalTime();
      }
      return true;
    }
    advance(target, budget = 2000) {
      let events = 0;
      while (this.nextEventTime() <= target && events < budget) {
        this.processEvent(); events++;
      }
      // If the budget is exhausted, slow the clock instead of skipping any events.
      if (this.nextEventTime() > target) this.moveTo(target);
      return events;
    }
    step() { return this.processEvent(); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PacketQueueSimulation;
  else root.PacketQueueSimulation = PacketQueueSimulation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
