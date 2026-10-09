document.querySelectorAll('.social-pending').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('#social-status').textContent = `Le lien ${button.dataset.network} de la communauté sera ajouté prochainement.`;
  });
});
