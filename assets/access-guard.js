/* ===================== GARDE D'ACCÈS (à inclure sur les pages protégées) =====================
   Ce script vérifie que le visiteur est connecté ET a payé l'accès (has_access = true)
   avant d'afficher la page. Sinon, il redirige vers la connexion ou l'achat.

   À inclure sur une page protégée, APRÈS supabase-client.js :

   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="supabase-client.js"></script>
   <script src="access-guard.js"></script>

   Astuce pendant les tests (sans Stripe branché) : pour te donner un accès
   "à la main", va dans Supabase → Table Editor → access_grants → Insert row,
   avec ton user_id (visible dans Authentication → Users) et has_access = true.
================================================================================================ */

(async function guardAccess(){
  // Cache immédiatement le contenu de la page pendant la vérification,
  // pour éviter un effet de clignotement où le contenu payant s'affiche brièvement.
  document.documentElement.style.visibility = 'hidden';

  const currentPage = location.pathname.split('/').pop() || 'index.html';
  const { loggedIn, hasAccess } = await checkAccess();

  if(!loggedIn){
    location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
    return;
  }

  if(!hasAccess){
    location.href = 'presentation.html?accessRequired=1';
    return;
  }

  // Accès valide : on affiche la page normalement.
  document.documentElement.style.visibility = 'visible';
})();
