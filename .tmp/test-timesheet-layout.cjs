const fs=require('fs'), vm=require('vm'), ts=require('typescript'), assert=require('node:assert/strict');
const React=require('../apps/admin-web/node_modules/react');
const {renderToStaticMarkup}=require('../apps/admin-web/node_modules/react-dom/server');
const source=fs.readFileSync('apps/admin-web/src/components/portal/TimesheetDetailModal.tsx','utf8');
const ast=ts.createSourceFile('modal.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='TimesheetSessionRows');
const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
const context={React,formatTime:()=> '09:00',formatHours:String,LocationCell:()=>null};vm.createContext(context);vm.runInContext(js,context);
for(const showTotals of [true,false]) {
 const html=renderToStaticMarkup(React.createElement('table',null,React.createElement('tbody',null,React.createElement(context.TimesheetSessionRows,{sessionIndex:showTotals?0:1,days:Array.from({length:7},(_,i)=>({date:String(i),entries:[]})),showTotals,totals:{totalHours:8,regularHours:8,overtimeHours:0},detailsColumn:true}))));
 const rows=[...html.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/g)];assert.equal(rows.length,4);
 rows.forEach((row,i)=>{const cells=[...row[1].matchAll(/<(td|th)\b/g)].length;assert.equal(cells+(showTotals&&i>0?3:0),17,`session=${showTotals?0:1} row=${i}`)});
}
console.log('PASS: all expanded rows occupy 17 columns, including rowspan totals and additional sessions');
