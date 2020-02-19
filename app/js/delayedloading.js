(() => {
    document.getElementById('loadURL').innerText = getParameterByName("url");
})();

window.addEventListener('focus', () => {
    window.location.replace(document.getElementById('loadURL').innerText);
});