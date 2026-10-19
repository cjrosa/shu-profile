/* Shared finite generation-cycle playback, extracted from Scene 3.
 * Visual phases are supplied by each scene; prediction and selection stay in
 * the existing teaching model. A Step runs the remainder of exactly one cycle.
 */
(function(root){
 'use strict';
 root.llmGenerationPlayback=function(options){
  const state={phase:-1,active:false,playing:false,remaining:0};
  let timer=null,started=0,revision=0;
  const notify=()=>options.onState?.(state);
  function stopTimer(){if(timer!==null){root.clearTimeout(timer);state.remaining=Math.max(0,state.remaining-(performance.now()-started));timer=null;}revision++;}
  function pause(){stopTimer();state.active=false;state.playing=false;options.pauseEffects?.();notify();}
  function reset(){pause();state.phase=-1;state.remaining=0;notify();}
  function schedule(){const version=++revision;started=performance.now();timer=root.setTimeout(()=>{timer=null;if(version===revision&&state.active)advance();},state.remaining);}
  function idle(){const repeat=state.playing&&!options.isEnded();state.phase=-1;options.onCycleEnd?.();if(repeat){advance();return;}pause();}
  function advance(){
   state.phase++;
   if(state.phase===options.durations.length){idle();return;}
   state.remaining=options.duration?.(state.phase)??options.durations[state.phase];notify();
   if(options.onPhase(state.phase)===false){idle();return;}
   if(state.active)schedule();
  }
  function start(auto){if(options.isEnded()&&state.phase<0)return;state.playing=auto;state.active=true;options.resumeEffects?.();notify();if(state.phase<0)advance();else schedule();}
  return {state,start,pause,reset,get elapsed(){return state.phase<0?0:(options.duration?.(state.phase)??options.durations[state.phase])-state.remaining+(timer!==null?performance.now()-started:0);}};
 };
})(window);
