const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [id,file] of Object.entries({custodyDomain:'custody.cjs',notificationFlowDomain:'notification-flow.cjs',gameCatalogDomain:'game-catalog.cjs',addGameFeature:'add-game.js',borrowingListFeature:'borrowing-list.js',custodyFeature:'custody-ui.js',collectionFiltersFeature:'collection-filters.js',compactPanelsFeature:'compact-panels.js',cloudClientFeature:'cloud-client.js',feedbackFeature:'feedback-ui.js',cloudCollectionModel:'cloud-collection-model.cjs',cloudWorkspaceFeature:'cloud-workspace.js',cloudGroupsFeature:'cloud-groups.js',collectionGalleryFeature:'collection-gallery.js'})){
  const script='<script id="'+id+'">'+fs.readFileSync(path.join(root,'features',file),'utf8')+'</script>';
  const pattern=new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>');
  html=pattern.test(html)?html.replace(pattern,()=>script):html.replace('</html>',()=>script+'</html>');
}
fs.writeFileSync(path.join(root,'index.html'),html);
