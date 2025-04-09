function snackbar(message, type) {
    const existingNodes = document.querySelectorAll('.snackbar')
    for (const node of existingNodes) {
        node.remove()
    }
    const node = document.createElement('div')
    node.className = 'snackbar snackbar-fade-in'
    if (type === 'error') {
        node.style.borderLeft = '4px solid #f44336'
    } else if (type === 'success') {
        node.style.borderLeft = '4px solid #4CAF50'
    } else {
        node.style.borderLeft = '4px solid #2196F3'
    }
    node.innerText = message
    document.body.appendChild(node)
    setTimeout(() => {
        node.classList.remove('snackbar-fade-in')
        node.classList.add('snackbar-fade-out')
        setTimeout(() => {
            node.remove()
        }, 600)
    }, 2000)
}
