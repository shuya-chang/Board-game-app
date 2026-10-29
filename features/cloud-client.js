/* Explicit cloud boundary. No preview seed data is uploaded automatically. */
(function(root){
  let client=null;
  async function initialize(createClient){
    const response=await fetch('/api/public-config',{cache:'no-store'});
    if(!response.ok)throw new Error('雲端設定尚未就緒');
    const config=await response.json();
    if(!config.supabaseUrl||!config.supabasePublishableKey)return {configured:false};
    if(typeof createClient!=='function')throw new Error('登入元件尚未載入');
    client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
    return {configured:true};
  }
  function requireClient(){if(!client)throw new Error('Supabase 尚未連結');return client;}
  async function signIn(){const {error}=await requireClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/'}});if(error)throw error;}
  async function signOut(){const {error}=await requireClient().auth.signOut();if(error)throw error;}
  async function session(){const {data,error}=await requireClient().auth.getSession();if(error)throw error;return data.session;}
  async function savePrivateNote(gameId,body){const {error}=await requireClient().rpc('save_private_note',{target_game:gameId,note_body:body});if(error)throw error;}
  async function privateNotes(){const {data,error}=await requireClient().from('private_notes').select('game_id,body,updated_at');if(error)throw error;return data;}
  async function rpc(name,args){const {data,error}=await requireClient().rpc(name,args);if(error)throw error;return data;}
  async function collections(){const {data,error}=await requireClient().from('collections').select('*,catalog_games(*)');if(error)throw error;return data;}
  async function loans(){const {data,error}=await requireClient().from('loans').select('*').order('created_at',{ascending:false});if(error)throw error;return data;}
  const requestLoan=(copyId,contact,dueDate=null,note='')=>rpc('request_loan',{target_collection:copyId,contact,due_date:dueDate,request_note:note});
  const actOnLoan=(loanId,command,contact='')=>rpc('act_on_loan',{target_loan:loanId,command,contact});
  const addCollection=(gameId,status='owned',copyId=crypto.randomUUID())=>rpc('add_collection',{target_game:gameId,collection_status:status,copy_id:copyId});
  const saveCollection=(copyId,values)=>rpc('save_collection',{target_copy:copyId,collection_status:values.status,owner_rating:values.recommendation??null,play_minutes:values.actualMinutes??null,play_basis:values.actualBasis||'whole',archive:!!values.archive});
  const saveTerms=(copyId,deposit,fee)=>rpc('save_collection_terms',{target_copy:copyId,deposit_amount:deposit,fee_amount:fee});
  const fillDescription=(gameId,body)=>rpc('fill_description',{target_game:gameId,description_body:body});
  const createGame=(values,status='owned')=>rpc('create_catalog_game',{game_data:values,collection_status:status});
  const lendCopy=(copyId,memberId,borrowerData,ownerContact,dueDate=null)=>rpc('lend_copy',{target_copy:copyId,member:memberId,borrower_data:borrowerData,owner_contact_text:ownerContact,due_date:dueDate});
  root.BoardGameCloud={initialize,signIn,signOut,session,savePrivateNote,privateNotes,collections,loans,requestLoan,actOnLoan,addCollection,saveCollection,saveTerms,fillDescription,createGame,lendCopy};
})(globalThis);
