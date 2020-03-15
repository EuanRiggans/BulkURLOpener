(() => {
    document.getElementById('loadURL').innerText = decodeURIComponent(getParameterByName("url"));
    document.getElementById('page-title').innerText = decodeURIComponent(getParameterByName("url"));
})();

window.addEventListener('focus', () => {
    window.location.replace(document.getElementById('loadURL').innerText);
});