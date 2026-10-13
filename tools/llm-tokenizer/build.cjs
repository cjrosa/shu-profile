const path = require('node:path');
require('esbuild').buildSync({
  absWorkingDir:__dirname,
  entryPoints:['entry.js'], bundle:true, minify:true, format:'iife',
  globalName:'LLMTokenizerVendor',
  outfile:path.resolve(__dirname,'../../assets/js/vendor/cl100k-tokenizer.js'),
  footer:{js:"if(typeof module!=='undefined')module.exports=LLMTokenizerVendor;"}
});
