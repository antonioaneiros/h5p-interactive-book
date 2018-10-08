import SideBar from './sidebar';
import StatusBar from './statusbar';

export default class DigiBook extends H5P.EventDispatcher {
  /**
   * @constructor
   *
   * @param {object} config
   * @param {string} contentId
   * @param {object} contentData
   */
  constructor(config, contentId, contentData = {}) {
    super();
    const self = this;
    this.activeChapter = 0;
    this.newHandler = {};

    // H5P-instances (columns)
    this.instances = [];
    // Div-elements of the abovementioned h5p-instances
    this.columnElements = [];


    if (H5P.externalEmbed === false) {
      this.internal = true;
    }
    else if (H5P.communicator) {
      this.internal = false;
    }


    //Go through all columns and initialise them
    for (let i = 0; i < config.chapters.length; i++) {
      const newColumn = document.createElement('div');
      const newInstance = H5P.newRunnable(config.chapters[i].chapter, contentId, H5P.jQuery(newColumn), contentData);
      newColumn.classList.add('h5p-digibook-chapter');
      newInstance.title = config.chapters[i].chapter_title;
      //First chapter should be visible.
      //TODO: Make it user spesific?
      if (i != 0) {
        newColumn.style.display = 'none';
      }
      //Register both the HTML-element and the H5P-element
      this.instances.push(newInstance);
      this.columnElements.push(newColumn);
    }

    //Initialize the support components
    this.sideBar = new SideBar(config, contentId, this);
    this.statusBar = new StatusBar(contentId, config.chapters.length, this);

    //Kickstart the statusbar
    this.statusBar.updateStatusBar();

    /**
     * Establish all triggers
     */
    this.on('toggleMenu', () => {
      this.sideBar.div.classList.toggle('h5p-digibook-hide');

      //The transition time is set in CSS at 0.5 seconds
      setTimeout(function () {
        self.trigger('resize');
      }, 500);
    });

    this.on('scrollToTop', () => {
      this.sideBar.div.scrollIntoView(true);
    });

    /**
     * 
     */
    this.on('newChapter', (event) => {
      this.newHandler = event.data;

      //Assert that the module itself is asking for a redirect
      this.newHandler.redirectFromComponent = true;

      // Create the new hash
      const idString = 'h5pbookid=' + this.newHandler.h5pbookid;
      const chapterString = 'chapter=' + this.newHandler.chapter;
      const sectionString = 'section=' + this.newHandler.section;
      event.data.newHash = "#" + idString + "&" + chapterString + "&" + sectionString;

      if (this.internal) {
        parent.H5P.communicator.send("changeHash", event.data);
      }
      else {
        H5P.communicator.send('changeHash', event.data);
      }
    });

    /**
     * If the content is short, hide the footer
     * @param {div} targetChapter 
     */
    this.shouldFooterBeVisible = (targetChapter) => {
      if (targetChapter.clientHeight <= window.outerHeight) {
        this.statusBar.bot.hidden = true;
      }
      else {
        this.statusBar.bot.hidden = false;
      }
    }; 

    /**
     * Input in targetPage should be: 
     * @param {int} chapter - The given chapter that should be opened
     * @param {int} section - The given section to redirect
     */
    this.changeChapter = function () {
      const targetPage = this.newHandler;

      if (targetPage.chapter < self.columnElements.length) {
        const targetChapter = self.columnElements[targetPage.chapter];
        const sectionsInChapter = targetChapter.getElementsByClassName('h5p-column-content');

        if (targetChapter.style.display === 'none') {
          self.columnElements[self.activeChapter].style.display = 'none';
          targetChapter.style.display = 'block';

          //If the content is short, hide the footer
          this.shouldFooterBeVisible(targetChapter);
        }
        self.activeChapter = parseInt(targetPage.chapter);

        self.trigger('resize');
        //Avoid accidentaly referring to a section that does not exist
        if (targetPage.section < sectionsInChapter.length) {
          // Workaround on focusing on new element
          setTimeout(function () {
            sectionsInChapter[targetPage.section].scrollIntoView(true);
          }, 0);
          this.statusBar.updateStatusBar();
          targetPage.redirectFromComponent = false;

        }
      }
    };
    /**
     * Attach library to wrapper
     * @param {jQuery} $wrapper
     */
    this.attach = function ($wrapper) {

      $wrapper[0].classList.add('h5p-scrollable-fullscreen');
      // Needed to enable scrolling in fullscreen
      $wrapper[0].id = "h5p-digibook";
      $wrapper.get(0).appendChild(this.statusBar.top);

      const content = document.createElement('div');
      content.classList.add('h5p-digibook-content');
      content.appendChild(this.sideBar.div);
      this.columnElements.forEach(element => {
        content.appendChild(element);
      });

      $wrapper.get(0).appendChild(content);
      $wrapper.get(0).appendChild(this.statusBar.bot);
    };

    /**
     * Allow for external redirects via hash parameters
     * @param {int} h5pbookid identifier of which book in question
     * @param {int} chapter Chapter which should be redirected to
     * @param {int} section Which section in the abovementioned chapter
     * @example exampleurl/#h5pbookid=X&chapter=Y&section=Z
     */
    document.addEventListener('readystatechange', event => {
      if (event.target.readyState === "complete") {
        const rawparams = top.location.hash.replace('#', "").split('&').map(el => el.split("="));
        const redirObj = {};


        //Split up the hash parametres and assign to an object
        rawparams.forEach(argPair => {
          redirObj[argPair[0]] = argPair[1];
        });

        if (redirObj.h5pbookid == self.contentId && redirObj.chapter && redirObj.section) {
          //asssert that the redirect parameters is two good bois 
          if (isNaN(redirObj.section)) {
            redirObj.section = 0;
          }
          if (isNaN(redirObj.chapter)) {
            return;
          }
          this.newHandler = redirObj;
          this.changeChapter();
        }

        else {
          // Check for the first chapters content height 
          this.shouldFooterBeVisible(this.columnElements[0]);
        }
      }
    });

    /**
     * Triggers whenever the hash changes, indicating that a chapter redirect is happening
     */
    if (this.internal) {

      parent.onhashchange = (event) => {
        if (event.newURL.indexOf('h5pbookid' !== -1)) {
          const payload = {
            newHash: new URL(event.newURL).hash,
            context: 'h5p'};
          this.redirectChapter(payload);
        }
      };

    }
    
    else {
      H5P.on(this, 'newHash',(event) => {
        this.redirectChapter(event);
      });
    }

    this.redirectChapter = function (event) {
      /**
       * If true, we already have information regarding redirect in newHandler
       * When using browser history, a convert is neccecary
       */
      if (!self.newHandler.redirectFromComponent) {
        let hash;
        if (this.internal) {
          hash = event.newHash;
        }
        else {
          hash = event.data.newHash;
        }

        //Only attempt converting if there is actually a hash present
        if (hash) {
          const hashArray = hash.replace("#", "").split("&").map(el => el.split("="));
          const tempHandler = {};
          hashArray.forEach(el => {
            const key = el[0];
            const value = el[1];
            tempHandler[key] = value;
          });

          //assert that the handler actually is from this content type. 
          if (tempHandler.h5pbookid == self.contentId && tempHandler.chapter && tempHandler.section) {
            self.newHandler = tempHandler;
          }

        }
        else {
          return;
        }
      }

      self.changeChapter();
    };
    
    if (this.internal) {

      // Assign the function changeHash to the parent communicator
      parent.H5P.communicator.on('changeHash', (event) => {
        if (event.context === 'h5p') {
          parent.location.hash = event.newHash;
        }
      });
    }
  }
}


