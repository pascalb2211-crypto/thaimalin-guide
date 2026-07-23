/* ===================== CLIENT SUPABASE PARTAGÉ =====================
   Ce fichier initialise la connexion à Supabase. Il doit être inclus
   APRÈS la librairie supabase-js et AVANT tout script qui l'utilise :

   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="supabase-client.js"></script>

   La clé ci-dessous est la clé "anon public" — elle est faite pour être
   visible dans le code du site, ce n'est pas une donnée secrète. Ne jamais
   remplacer par la clé "service_role".
====================================================================== */

const SUPABASE_URL = 'https://mmnscqrbqquujsjmqtbm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tbnNjcXJicXF1dWpzam1xdGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MTU0NzMsImV4cCI6MjEwMDM5MTQ3M30.yqEwc7bog-BLQxO9yMUPfWxMeMJ2nebLnzp7s2qsK3w';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== FONCTIONS PARTAGÉES ===================== */

async function signUp(email, password){
  return await supabaseClient.auth.signUp({ email, password });
}

async function signIn(email, password){
  return await supabaseClient.auth.signInWithPassword({ email, password });
}

async function signOut(){
  return await supabaseClient.auth.signOut();
}

async function getCurrentUser(){
  const { data } = await supabaseClient.auth.getUser();
  return data.user || null;
}

// Vérifie si l'utilisateur connecté a un accès payant valide (has_access = true)
async function checkAccess(){
  const user = await getCurrentUser();
  if(!user) return { loggedIn:false, hasAccess:false, user:null };

  const { data, error } = await supabaseClient
    .from('access_grants')
    .select('has_access')
    .eq('user_id', user.id)
    .maybeSingle();

  if(error){
    console.warn('Erreur de vérification d\'accès :', error);
    return { loggedIn:true, hasAccess:false, user };
  }

  return { loggedIn:true, hasAccess: !!(data && data.has_access), user };
}
