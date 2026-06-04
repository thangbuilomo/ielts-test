// Custom Right-Click Highlighter for IELTS Passage Panel

class Highlighter {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    if (!this.container) return;
    
    this.menu = null;
    this.init();
  }

  init() {
    // Prevent default context menu on right click in container
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      if (selectedText.length > 0) {
        this.showMenu(e.pageX, e.pageY);
      } else {
        this.hideMenu();
      }
    });

    // Hide menu on clicking outside
    document.addEventListener('mousedown', (e) => {
      if (this.menu && !this.menu.contains(e.target)) {
        this.hideMenu();
      }
    });
  }

  showMenu(x, y) {
    this.hideMenu();

    this.menu = document.createElement('div');
    this.menu.className = 'hl-menu';
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;

    const colors = ['yellow', 'green', 'pink', 'blue', 'clear'];
    colors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = `hl-btn ${color}`;
      btn.title = color === 'clear' ? 'Clear Highlight' : `Highlight ${color}`;
      btn.addEventListener('click', () => {
        this.applyHighlight(color);
        this.hideMenu();
      });
      this.menu.appendChild(btn);
    });

    document.body.appendChild(this.menu);
  }

  hideMenu() {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
    }
  }

  applyHighlight(color) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    
    if (color === 'clear') {
      // Clear formatting in selection
      document.execCommand('removeFormat', false, null);
      return;
    }

    const span = document.createElement('span');
    span.className = `hl-${color}`;
    
    try {
      range.surroundContents(span);
    } catch (err) {
      // Fallback if selection spans across multiple blocks/nodes
      const hexColor = this.getHexColor(color);
      document.execCommand('backColor', false, hexColor);
    }
    
    selection.removeAllRanges();
  }

  getHexColor(color) {
    switch (color) {
      case 'yellow': return '#fef08a';
      case 'green': return '#bbf7d0';
      case 'pink': return '#fbcfe8';
      case 'blue': return '#bfdbfe';
      default: return '#ffffff';
    }
  }
}
