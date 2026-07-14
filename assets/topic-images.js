(() => {
  const hydrate = () => {
    const topics = window.SPOR_OKULU_EDUCATION?.topics || [];
    document.querySelectorAll('.topic-card:not(.has-topic-image)').forEach((card, index) => {
      const topic = topics[index];
      const documentId = topic?.url?.match(/\/d\/([^/]+)/)?.[1];
      if (!documentId) return;
      const image = document.createElement('img');
      image.className = 'topic-card-image';
      image.src = `https://drive.google.com/thumbnail?id=${documentId}&sz=w600`;
      image.alt = `${topic.title} teknik eğitim görseli`;
      image.loading = 'lazy';
      image.addEventListener('error', () => card.classList.add('topic-image-error'), {once:true});
      card.prepend(image);
      card.classList.add('has-topic-image');
    });
  };
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (!app) return;
    new MutationObserver(hydrate).observe(app, {childList:true, subtree:true});
    hydrate();
  });
})();
