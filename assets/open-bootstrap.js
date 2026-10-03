// Load the opener through a small independent script so module failures cannot
// leave a permanently disabled "Preparing your gift" screen.
(function () {
  var stage = document.getElementById('giftStage'), panel = null;
  function unavailable() {
    if (panel || stage.dataset.state !== 'loading') return;
    var en = document.documentElement.lang === 'en';
    var status = document.getElementById('sceneLoading');
    status.textContent = en ? 'The opening could not load. Please try again.' : 'Не удалось загрузить открытие. Попробуйте ещё раз.';
    panel = document.createElement('aside');
    panel.className = 'local-gift-sharing';
    panel.setAttribute('role', 'alert');
    var message = document.createElement('p');
    message.textContent = status.textContent;
    var retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'action primary';
    retry.textContent = en ? 'Try again' : 'Попробовать снова';
    retry.onclick = function () { location.reload(); };
    var back = document.createElement('a');
    back.className = 'action secondary'; back.href = 'index.html';
    back.textContent = en ? 'Back to Thauma' : 'Вернуться в Thauma';
    panel.append(message, retry, back); stage.before(panel);
  }
  var timer = setTimeout(unavailable, 15000);
  import('./open-continuous-review.js?v=20261003-duration1').then(function () {
    clearTimeout(timer);
    if (panel) { panel.remove(); panel = null; }
  }).catch(function () {
    clearTimeout(timer); unavailable();
  });
})();
