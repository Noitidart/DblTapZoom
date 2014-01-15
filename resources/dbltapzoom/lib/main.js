const {Cc, Ci, Cu, components} = require('chrome');
const selfId = 'jid0-DblTapZoom';
const selfTitle = 'dbltapzoom';
const selfPath = 'resource://' + selfId + '-at-jetpack/' + selfTitle + '/'; //NOTE - this must be gotten from "Properties" panel //example: selfPath + 'data/style/global.css'
const prefPrefix = 'extensions.' + selfId + '@jetpack.'; //for the pref stuff //jetpack stuff has @jetpack appended //note must have period at end because when do branch.set if no period then there is no period between prefix and the set name, likewise for get

Cu.import("resource://gre/modules/Services.jsm");
const wm = Services.wm; //Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);
const as = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
const obs = Services.obs; //Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
const ps = Services.prefs; //Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

var mObservers = []; //a new mutation observer per window //holds [{win: window, obs: observer}
var mObserverConfig = {attributes: true};


var observers = {
    /*
    inlineOptsHid: {
        observe:    function(aSubject, aTopic, aData) {
                        //##Cu.reportError('incoming inlineOptsHid: aSubject = ' + aSubject + ' | aTopic = ' + aTopic + ' | aData = ' + aData);
                        if (aTopic == 'addon-options-hidden' && aData == selfId + '@jetpack') {
                            addonMgrXulWin = null; //trial as of 112713
                        }
                    },
        reg:    function() {
                obs.addObserver(observers.inlineOptsHid, 'addon-options-hidden', false);
            },
        unreg:    function() {
                obs.removeObserver(observers.inlineOptsHid, 'addon-options-hidden');
            }
    }
    */
};

////start pref listener stuff
//edit prefs objection ONLY
//all pref paths are preceded with: 'extensions.' + selfTitle + '.
var prefs = { //each key here must match the exact name the pref is saved in the about:config database (without the prefix)
    /*
    hotkey_hopTabCurWin: {
        default: '{"keycode":19, "action":"upped", "mods":[]}',
        value: null, //the current value, initialize on addon statup NEVER SET VALUE PROGRAMATICALLY, IF NEED TO SET VALUE THEN USE THE prefs[name].setval function, this is because onChange callback I use .value to figure out oldVal. setval func is like setting the pref in about:config, if json pref then must supply object
        type: 'Char', //call later on by going ps.['get' + pefs.blah.type + 'Pref'](prefs.blah.value) AND OR ps.['set' + pefs.blah.type + 'Pref'](prefs.blah.value)
        json: null, //if json is true then JSON.parse'ed when value is set, it should hold the non-parsed version of value (this saves the callback from running a JSON.stringify when figuring out oldValue
        onChange: hotkeyPref_onChange//this is additonal stuff you want to happen when pref observer finds it changes, by default on observe prefs.blah.value is matched to the new value, THIS SHOULD ALSO EXEC ON INIT(/ADDON STARTUP)        //so in all observers, whenever a pref is changed, it will set the prefs.blah.value to new value. onPreChange fires before prefs.blah.value is matched to new val        //onChange fires after value is matched to new val
    },
    */
};

function prefSetval(name, updateTo) {
	if ('json' in prefs[name]) {
		//updateTo must be an object
		if (Object.prototype.toString.call(updateTo) != '[object Object]') {
			//##Cu.reportError('EXCEPTION: prefs[name] is json but updateTo supplied is not an object');
			return;
		}

		var stringify = JSON.stringify(updateTo); //uneval(updateTo);
		myPrefListener._branch['set' + prefs[name].type + 'Pref'](name, stringify);
		//prefs[name].value = {};
		//for (var p in updateTo) {
		//    prefs[name].value[p] = updateTo[p];
		//}
	} else {
		//prefs[name].value = updateTo;
		myPrefListener._branch['set' + prefs[name].type + 'Pref'](name, updateTo);
	}
}
///pref listener generic stuff NO NEED TO EDIT
/**
 * @constructor
 *
 * @param {string} branch_name
 * @param {Function} callback must have the following arguments:
 *   branch, pref_leaf_name
 */
function PrefListener(branch_name, callback) {
	// Keeping a reference to the observed preference branch or it will get
	// garbage collected.
	this._branch = ps.getBranch(branch_name);
	this._defaultBranch = ps.getDefaultBranch(branch_name);
	this._branch.QueryInterface(Ci.nsIPrefBranch2);
	this._callback = callback;
}

PrefListener.prototype.observe = function (subject, topic, data) {
	if (topic == 'nsPref:changed')
		this._callback(this._branch, data);
};

/**
 * @param {boolean=} trigger if true triggers the registered function
 *   on registration, that is, when this method is called.
 */
PrefListener.prototype.register = function (trigger) {
	//adds the observer to all prefs and gives it the seval function
	this._branch.addObserver('', this, false);
	for (var p in prefs) {
		prefs[p].setval = prefSetval;
	}
	if (trigger) {
		this.forceCallbacks();
	}
};

PrefListener.prototype.forceCallbacks = function () {
	//##Cu.reportError('forcing pref callbacks');
	let that = this;
	this._branch.getChildList('', {}).
	forEach(function (pref_leaf_name) {
		that._callback(that._branch, pref_leaf_name);
	});
};

PrefListener.prototype.setDefaults = function () {
	//sets defaults on the prefs in prefs obj
	//##Cu.reportError('setDefaults');
	for (var p in prefs) {
		this._defaultBranch['set' + prefs[p].type + 'Pref'](p, prefs[p].
			default);
	}
};

PrefListener.prototype.unregister = function () {
	if (this._branch)
		this._branch.removeObserver('', this);
};

var myPrefListener = new PrefListener(prefPrefix, function (branch, name) {
	//extensions.myextension[name] was changed
	//##Cu.reportError('callback start for pref: "' + name + '"');
	if (!(name in prefs)) {
		return; //added this because apparently some pref named prefPreix + '.sdk.console.logLevel' gets created when testing with builder
	}

	var refObj = {
		name: name
	}; //passed to onPreChange and onChange
	var oldVal = 'json' in prefs[name] ? prefs[name].json : prefs[name].value;
	try {
		var newVal = myPrefListener._branch['get' + prefs[name].type + 'Pref'](name);
	} catch (ex) {
		//##Cu.reportError('exception when getting newVal (likely the pref was removed): ' + ex);
		var newVal = null; //note: if ex thrown then pref was removed (likely probably)
	}

	prefs[name].value = newVal === null ? prefs[name].
	default : newVal;

	if ('json' in prefs[name]) {
		refObj.oldValStr = oldVal;
		oldVal = JSON.parse(oldVal); //function(){ return eval('(' + oldVal + ')') }();

		refObj.newValStr = prefs[name].value;
		prefs[name].json = prefs[name].value;
		prefs[name].value = JSON.parse(prefs[name].value); //function(){ return eval('(' + prefs[name].value + ')') }();
	}

	if (prefs[name].onChange) {
		prefs[name].onChange(oldVal, prefs[name].value, refObj);
	}
	//##Cu.reportError('myPrefCallback done');
});
////end pref listener stuff
//end pref stuff


//////////START PROC

var prevDefault = 0; //holds time stamp of when mouse downed
var lastUpPrevd = 0; //holds time stamp that last up was prevented
var lastClickPrevd = 0;
var lastDblPrevd = 0;
var msToPrev = 300; //ups, clicks, dblclicks will be prevented for this many ms after prevDefault set
var trigger = 0; //mouse button to trigger zoom
var holdTime = 300; //ms to hold trigger for before it zooms
var zoomed = 0; //time at which zoomed
var timeout = null;
var timeoutWin;
var dbltapzoom_blockListenForHoldOnDown = false; //used to indicate that we are sending click cuz user mouseu before holdTime reached
var uppedAfterZoom = false
var clickedAfterZoom = false;
var dblClickedAfterZoom = false;
var uppedAfterListen = false;
var clickedAfterListen = false;
var dblClickedAfterListen = false;

function downed(e) {

	if (e.button != trigger) { return }
	
	Cu.reportError('downed trigger');
	uppedAfterZoom = true;
	clickedAfterZoom = true;
	dblClickedAfterZoom = true;
	
	uppedAfterListen = true;
	clickedAfterListen = true;
	dblClickedAfterListen = true;
	
	if (dbltapzoom_blockListenForHoldOnDown) {
		Cu.reportError('will not listen for hold as listening for hold is blocked');
		timeout = null;
		dbltapzoom_blockListenForHoldOnDown = false;
		return;
	}

	uppedAfterListen = false;
	clickedAfterListen = false;
	dblClickedAfterListen = false;
	
	Cu.reportError('downed and listening for hold');
	prevDefault = new Date().getTime();
	var win = e.originalTarget.ownerDocument.defaultView;
	timeoutWin = win;
	timeout = win.setTimeout(function() { zoom(e) }, holdTime);
	win.addEventListener('mousemove', moved, true);
	Cu.reportError('down prevd');
	e.stopPropagation();
	e.preventDefault();
	e.returnValue = false;
	return false;
}

function moved(e) {
	Cu.reportError('moved - clearing listening for hold');
	var win = e.originalTarget.ownerDocument.defaultView;
	win.removeEventListener('mousemove', moved, true);
	timeoutWin.clearTimeout(timeout);
	timeout = null;
	var utils = timeoutWin.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
	dbltapzoom_blockListenForHoldOnDown = true;
	timeoutWin.setTimeout(function() {
		Cu.reportError('sending synthetic mousedown');
		utils.sendMouseEvent('mousedown',e.clientX,e.clientY,trigger,1,0);
	}, 1);
	//moved mouse so they are doing selecting/highlighting so cancel listening to the hold
}

function upped(e) {
	if (e.button != trigger) { return }
	Cu.reportError('upped');
	var now = new Date().getTime();
	if (!uppedAfterZoom) {
		Cu.reportError('up prevd - after zoomed');
		//timeoutWin.setTimeout(function(){ Cu.reportError('zoomed and clickedAfterZoom is still false so meaning click never fired when user upped so setting it to false now'); clickedAfterZoom = false }, 10);
		e.stopPropagation();
		e.preventDefault();
		e.returnValue = false;
		return false;
	} else if (!uppedAfterListen) {
		//mouseup not coming from zoomed hold mouse down
		Cu.reportError('up prevd - after listen');
		Cu.reportError('at this point timeout should never be null, if it is then we have a problem timeout === ' + timeout + '\n ACTUALLY MAYBE NOT IN TROUBLE because if mousemoved they can come in here but because timout is null we shouldnt simulate the mousedown mouseup');
		if (timeout !== null) { //note: if timeout is null then it this mousedown was not listening for hold so dont do this stuff below, this stuff only happens if the mousedown was upped before holdtime
			var win = e.originalTarget.ownerDocument.defaultView;
			win.removeEventListener('mousemove', moved, true);
			Cu.reportError('clearing listening for hold');
			timeoutWin.clearTimeout(timeout);
			var utils = timeoutWin.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
			dbltapzoom_blockListenForHoldOnDown = true;
			timeoutWin.setTimeout(function() {
				Cu.reportError('sending synthetic mousedown mouseup');
				utils.sendMouseEvent('mousedown',e.clientX,e.clientY,trigger,1,0);
				utils.sendMouseEvent('mouseup',e.clientX,e.clientY,trigger,1,0);
			}, 100);
			//stop this up propogation because the down never went thru
			e.stopPropagation();
			e.preventDefault();
			e.returnValue = false;
			return false;
		}
	} else {
		var win = e.originalTarget.ownerDocument.defaultView;
		win.removeEventListener('mousemove', moved, true);
		Cu.reportError('upped dont know why here');
	}
}

function clicked(e) {
	if (e.button != trigger) { return }
	Cu.reportError('clicked');
	var now = new Date().getTime();
	if (!clickedAfterZoom) {
		Cu.reportError('click prevd - after zoomed');
		e.stopPropagation();
		e.preventDefault();
		e.returnValue = false;
		return false;
	} else if (!clickedAfterListen) {
		Cu.reportError('click prevd - after listen');
		e.stopPropagation();
		e.preventDefault();
		e.returnValue = false;
		return false;
	} else {
		Cu.reportError('clicked dont know why here');
	}
}

function dblclicked(e) {
	if (e.button != trigger) { return }
	Cu.reportError('dblclicked');
	var now = new Date().getTime();
	if (!dblClickedAfterZoom) {
		Cu.reportError('dblclick prevd - after zoomed');
		e.stopPropagation();
		e.preventDefault();
		e.returnValue = false;
		return false;
	} else if (!dblClickedAfterListen) {
		Cu.reportError('dblclick prevd - after listen');
		e.stopPropagation();
		e.preventDefault();
		e.returnValue = false;
		return false;
	} else {
		Cu.reportError('dblclicked dont know why here');
	}
}

function zoom(e) {
	timeout = null;
	zoomed = new Date().getTime();
	
	var win = e.originalTarget.ownerDocument.defaultView;
	win.removeEventListener('mousemove', moved, true);
	
    uppedAfterZoom = false;
	clickedAfterZoom = false;
	dblClickedAfterZoom = false;
	
    var elWin = e.originalTarget.ownerDocument.defaultView;
    var win = elWin.top;
    
    var docEl = win.document.documentElement;
    var docElRect = docEl.getBoundingClientRect();

    var el = {target:{}, parent:{}, doc:{}};
    el.target['el'] = e.originalTarget;
    el.parent['el'] = e.originalTarget;
    while (el.parent['el'] && el.parent['el'].ownerDocument.defaultView.getComputedStyle(el.parent['el'],null).display == 'inline') {
        el.parent['el'] = el.parent['el'].parentNode;
    }

    //el.parent['el'] = e.originalTarget.offsetParent;
    if (!el.parent['el']) {
        Cu.reportError('EXCEPTION - returning as el.parent.el is undefined');
		return;
    }
	
    el.target['attr'] = el.target.el.getAttribute('dbltapzoom');
    el.parent['attr'] = el.parent.el.getAttribute('dbltapzoom');
    el.target['rect'] = el.target.el.getBoundingClientRect();
    el.parent['rect'] = el.parent.el.getBoundingClientRect();
    el.doc['el'] = win.document.documentElement;
    el.doc['rect'] = el.doc.el.getBoundingClientRect();
    
    //attr values
    //1 = zoomed on this el
    //2 = guide el for setting scroll bars
    var oldEls = []; //the old elements that had the attr
    var subEls = win.document.querySelectorAll('[dbltapzoom]'); //the old elements that had the attr
    for (var j=0; j<subEls.length; j++) {
        oldEls.push(subEls[j]);
    }
    if (elWin != win) {
        var frames = win.frames;
        for (var i=0; i<frames.length; i++) {
            var subEls = frames[i].document.querySelectorAll('[dbltapzoom]'); //the old elements that had the attr
            for (var j=0; j<subEls.length; j++) {
                oldEls.push(subEls[j]);
            }
        }
    }
    Cu.reportError('oldEls.length = ' + oldEls.length);
    var zEl = null; //zoomEl decide which el to zoom, el or elP
    var gEl = null; //guidEl decide which el to use for guiding scroll bars
    
    scaleBy = undefined;
    
    var cScale = el.doc.el.style.transform.match(/\d\.\d\d/);
    cScale = cScale ? parseFloat(cScale) : 1;
//consider zooming parent if target == parent. then on second click zoom target
    if (!el.target.attr && !el.parent.attr) {
        Cu.reportError('nothing is zoomed so zoom parent');
        zEl = 'parent';
        gEl = 'target';
    }/* else if (el.parent.attr == 1) {
        alert('parent is zoomed, so zoom target');
        zEl = 'target';
        gEl = 'target';
    } else if (el.target.attr == 1) {
        alert('target is zoomed so zoomout');
        zEl = 'doc';
        gEl = 'target';
    }*/ else if (el.parent.attr != 1) {
        Cu.reportError('parent is NOT zoomed (and at this point in if statement it is obvious target is not zoomed) so zoom parent');
        zEl = 'parent';
        gEl = 'target';
    } else if (el.parent.attr == 1) {
        Cu.reportError('parent is zoomed so zoomout');
        zEl = 'doc';
        gEl = 'parent';
    } else {
        Cu.reportError('dont know why here but doing zoomout');
        Cu.reportError('el.target.attr = "' + el.target.attr + '"');
        Cu.reportError('el.parent.attr = "' + el.parent.attr + '"');
        
        zEl = 'doc';
        gEl = 'target';
    }
    
    scaleBy = el.doc.rect.width / el[zEl].rect.width;
    scaleBy = scaleBy.toPrecision(3);
    //var str = ['scaleBy: ' + scaleBy, 'cScale: ' + cScale];
    //alert(str.join('\n'));
    

    if (scaleBy == 1 && zEl == 'parent') {
        Cu.reportError('parent is is inital goal of zoom however its zoom is 1 so zooming target - DISCONTNUED');
        /*
        zEl = 'target';
        gEl = 'target';
        scaleBy = el.doc.rect.width / el[zEl].rect.width;
        scaleBy = scaleBy.toPrecision(3);
        */
    }
    
    if (scaleBy != 1 && scaleBy == cScale) {
        Cu.reportError('new scaleBy is equal to currently scaled, so no need to zoom, so zoomeout');
        zEl = 'doc';
        gEl = 'target';
        scaleBy = 1;
    }
        
    for (var i=0; i<oldEls.length; i++) {
        //alert(oldAttrEd[i].getAttribute('dbltapzoom'));
        oldEls[i].removeAttribute('dbltapzoom');
    }
    
    if (zEl != 'doc') { //shud probably do this setting of attribute after the removing of attributes from old els as else might overlap between old and current/new
        el[gEl].el.setAttribute('dbltapzoom','2');
        el[zEl].el.setAttribute('dbltapzoom','1'); //must do this 2nd as if gEl == zEl we want to ensure that zEl is set to 1 as that is very important in if logic above
    }
    
    

    
    el.doc.el.style.transform = 'scale('+scaleBy+','+scaleBy+')';
    el.doc.el.style.transformOrigin = 'top left';

    el[zEl].rect = el[zEl].el.getBoundingClientRect();
    el[gEl].rect = el[gEl].el.getBoundingClientRect(); //update el rect as it was transformed

    //e.originalTarget.scrollIntoView(true);
    //alert(el.offsetLeft*zoomScale + '\n' + gBrowser.contentWindow.scrollX);
    var str = ['scaleBy: ' + scaleBy, 'zEl nodename:' + el[zEl].el.nodeName, 'gEl nodename:' + el[gEl].el.nodeName, 'el[gEl].rect.left: ' + el[gEl].rect.left, 'el[gEl].rect.top: ' + el[gEl].rect.top, 'win.pageXOffset: ' + win.pageXOffset, 'win.pageYOffset: ' + win.pageYOffset];
    var scrollToX = el[zEl].rect.left + win.pageXOffset;
    var scrollToY = el[gEl].rect.top + win.pageYOffset;
    /*//not sure if i need this block, test it by zooming in on element in frame and see if the scroll bars of top win line up perfectly with the zoomed el
    var cWin = elWin;
    while (cWin != win) {
        scrollToX += cWin.pageXOffset;
        scrollToY += cWin.paygeYOffset;
    }
    */
    win.scrollTo(scrollToX, scrollToY);
    
    Cu.reportError(str.join('\n'));
	
	as.showAlertNotification(null, 'DblTabZoom - Zoomed', 'Content zoomed to ' + scaleBy);
}

function dblClick(e) {
    Cu.reportError('dbl clicked');
    
    //var scale = gBrowser.markupDocumentViewer.fullZoom //the zoom level of current tab
}

//////////END PROC
var windowListener = {
	//DO NOT EDIT HERE
	onOpenWindow: function (aXULWindow) {
		// Wait for the window to finish loading
		let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		aDOMWindow.addEventListener("load", function () {
			aDOMWindow.removeEventListener("load", arguments.callee, false);
			windowListener.loadIntoWindow(aDOMWindow);
		}, false);
	},
	onCloseWindow: function (aXULWindow) {},
	onWindowTitleChange: function (aXULWindow, aNewTitle) {},
	register: function () {
		// Load into any existing windows
		let XULWindows = wm.getEnumerator(null);
		while (XULWindows.hasMoreElements()) {
			let aXULWindow = XULWindows.getNext();
			let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow);
			windowListener.loadIntoWindow(aDOMWindow, aXULWindow);
		}
		// Listen to new windows
		wm.addListener(windowListener);
	},
	unregister: function () {
		// Unload from any existing windows
		let XULWindows = wm.getEnumerator(null);
		while (XULWindows.hasMoreElements()) {
			let aXULWindow = XULWindows.getNext();
			let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIDOMWindow);
			windowListener.unloadFromWindow(aDOMWindow, aXULWindow);
		}
		//Stop listening so future added windows dont get this attached
		wm.removeListener(windowListener);
	},
	//END - DO NOT EDIT HERE
	loadIntoWindow: function (aDOMWindow, aXULWindow) {
		var window = aDOMWindow;
		if (!window) {
			return;
		}

		if (window.gBrowser && window.gBrowser.tabContainer) {
			window.gBrowser.addEventListener('mousedown', downed, true);
			window.gBrowser.addEventListener('mouseup', upped, true);
			window.gBrowser.addEventListener('click', clicked, true);
			window.gBrowser.addEventListener('dblclick', dblclicked, true);
		}

	},
	unloadFromWindow: function (aDOMWindow, aXULWindow) {
		var window = aDOMWindow;
		if (!window) {
			return;
		}

		if (window.gBrowser && window.gBrowser.tabContainer) {
			window.gBrowser.removeEventListener('mousedown', downed, true);
			window.gBrowser.removeEventListener('mouseup', upped, true);
			window.gBrowser.removeEventListener('click', clicked, true);
			window.gBrowser.removeEventListener('dblclick', dblclicked, true);
		}

	}
};

exports.main = function (options, callbacks) {
	//##Cu.reportError('load reason: "' + options.loadReason + '"');

	//if (options.loadReason == 'install' || options.loadReason == 'enable' || options.loadReason == 'upgrade' || options.loadReason == 'downgrade') {
	myPrefListener.setDefaults(); //in jetpack they get initialized somehow on install so no need for this    //on startup prefs must be initialized first thing, otherwise there is a chance that an added event listener gets called before settings are initalized
	//setDefaults safe to run after install too though because it wont change the current pref value if it is changed from the default.
	//good idea to always call setDefaults before register, especially if true for tirgger as if the prefs are not there the value in we are forcing it to use default value which is fine, but you know what i mean its not how i designed it, use of default is a backup plan for when something happens (like maybe pref removed)
	//}
	myPrefListener.register(true); //true so it triggers the callback on registration, which sets value to current value

	//register all observers
	for (var o in observers) {
		observers[o].reg();
	}

	//load into all existing windows and into future windows on open
	windowListener.register();

};

exports.onUnload = function (reason) {
	//##Cu.reportError('onUnload reason: "' + reason + '"');
    
	//unregister all observers
	for (var o in observers) {
		observers[o].unreg();
	}

	//unregister all mutation observers
	for (var m = 0; m < mObservers.length; m++) {
		mObservers[m].obs.disconnect()
	}

	//load into all existing windows and into future windows on open
	windowListener.unregister();

	if (reason == 'uninstall') {
		//##Cu.reportError('deleting pref branch: ' + prefPrefix);
		ps.deleteBranch(prefPrefix);
	}
};