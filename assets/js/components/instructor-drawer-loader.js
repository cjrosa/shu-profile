(function loadInstructorDrawerComponent() {
  if (document.getElementById('instructor-drawer') || document.getElementById('inst-drawer-overlay')) {
    return;
  }

  function getComponentUrl() {
    // Resolve relative to this script so it works from root and nested folders.
    if (document.currentScript && document.currentScript.src) {
      var scriptUrl = new URL(document.currentScript.src, window.location.href);
      return new URL('../../components/instructor-drawer.html', scriptUrl).toString();
    }
    return '../assets/components/instructor-drawer.html';
  }

  fetch(getComponentUrl())
    .then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.text();
    })
    .then(function(html) {
      var container = document.createElement('div');
      container.innerHTML = html;
      while (container.firstChild) {
        document.body.appendChild(container.firstChild);
      }

      // Reuse the already-rendered profile avatar source when available.
      var sourceImage = document.querySelector('.prof-avatar img, .hero-prof-photo');
      var drawerImage = document.querySelector('#instructor-drawer .inst-photo');
      if (sourceImage && drawerImage && sourceImage.getAttribute('src')) {
        drawerImage.setAttribute('src', sourceImage.getAttribute('src'));
      }
    })
    .catch(function(error) {
      console.error('Failed to load instructor drawer component:', error);
    });
})();
