/**
 * Created by andreas on 02.05.14.
 */
avnav.provide('avnav.gui.Navpage');



/**
 *
 * @constructor
 * @extends {avnav.gui.Page}
 */
avnav.gui.Navpage=function(){
    avnav.gui.Page.call(this,'navpage');
    /** @private */
    this.options_=null;
    /**
     * @private
     * @type {number}
     */
    this.timer=0;
    /**
     * the current visible overlay (jQuery object)
     * @type {null}
     */
    this.overlay=null;
    /**
     * the time (in ms) when the current overlay should be hidden
     * @type {number}
     */
    this.hidetime=0;
    /**
     * the dom id of the map
     * @private
     * @type {string}
     */
    this.mapdom='avi_map_navpage';
    var self=this;
    /**
     * @private
     * @type {boolean}
     */
    this.routingVisible=false;
    $(document).on(avnav.nav.NavEvent.EVENT_TYPE, function(ev,evdata){
       self.navEvent(evdata);
    });
    $(document).on(avnav.map.MapEvent.EVENT_TYPE, function(ev,evdata){
        self.mapEvent(evdata);
    });

};
avnav.inherits(avnav.gui.Navpage,avnav.gui.Page);

/**
 * get the mapholder
 * @private
 * @returns {avnav.map.MapHolder}
 */
avnav.gui.Navpage.prototype.getMap=function(){
    if (!this.gui) return null;
    return this.gui.map;
};


avnav.gui.Navpage.prototype.showPage=function(options){
    if (!this.gui) return;
    this.fillDisplayFromGps();
    var newMap=false;
    if (options) {
        this.options_=options;
        newMap=true;
    }
    else {
        if (! this.options_){
            alert("invalid navpage call - no chart selected");
            return;
        }
    }
    if (newMap) {
        //chartbase: optional url for charts
        //list: the base url
        var chartbase = this.options_.charturl;
        var list = this.options_.url;
        if (!chartbase) {
            chartbase = list;
        }
        if (!list.match(/^http:/)) {
            if (list.match(/^\//)) {
                list = window.location.href.replace(/^([^\/:]*:\/\/[^\/]*).*/, '$1') + list;
            }
            else {
                list = window.location.href.replace(/[?].*/, '').replace(/[^\/]*$/, '') + "/" + list;
            }
        }
        var url = list + "/avnav.xml";
        var self = this;
        $.ajax({
            url: url,
            dataType: 'xml',
            cache: false,
            success: function (data) {
                self.getMap().initMap(self.mapdom, data, chartbase);
            },
            error: function (ev) {
                alert("unable to load charts " + ev.responseText);
            }
        });
    }
    this.updateMainPanelSize('#'+this.mapdom);
    this.getMap().updateSize();
    this.buttonUpdate(true);
    if (!this.gui.properties.getProperties().layers.ais){
        //hide the AIS panel if switched off
        //showing will be done by the AIS event
        if (this.showHideAdditionalPanel('#aisInfo', false, '#' + this.mapdom))
            this.gui.map.updateSize();
    }
    this.updateAisPanel();
    this.fillDisplayFromGps();
    this.handleRouteDisplay();
};
/**
 * the periodic timer call
 * update buttons and handle hiding of overlay
 * @param startTimer
 */
avnav.gui.Navpage.prototype.buttonUpdate=function(startTimer){
    //TODO: make this more generic
    var markerLock=this.navobject.getRoutingData().getLock();
    this.handleToggleButton('#avb_LockMarker',markerLock);
    var gpsLock=this.gui.map.getGpsLock();
    this.handleToggleButton('#avb_LockPos',gpsLock);
    var courseUp=this.gui.map.getCourseUp();
    this.handleToggleButton('#avb_CourseUp',courseUp);
    var self=this;
    if (this.hidetime >0 && this.hidetime <= new Date().getTime()|| gpsLock){
        this.hideOverlay();
        this.hidetime=0;
    }
    if (startTimer) this.timer=window.setTimeout(function(){
        self.buttonUpdate(true);
        },
        self.gui.properties.getProperties().buttonUpdateTime
    );
};

avnav.gui.Navpage.prototype.hidePage=function(){
    if (this.timer) window.clearTimeout(this.timer);
    this.hideOverlay();
    this.hidetime=0;
    this.hideRouting();
};
/**
 *
 */
avnav.gui.Navpage.prototype.localInit=function(){
    $('#leftBottomMarker').click({page:this},function(ev){
        var navobject=ev.data.page.navobject;
        var route=navobject.getRoutingData().getCurrentRoute();
        var marker=navobject.getRawData(avnav.nav.NavEventType.NAV).markerLatlon;
        ev.data.page.gui.map.setCenter(marker);
        //make the current WP the active again...
        if (route.active){
            navobject.getRoutingData().setActiveWp(route.currentTarget);
        }
    });
    $('#leftBottomPosition').click({page:this},function(ev){
        var gps=ev.data.page.navobject.getRawData(avnav.nav.NavEventType.GPS);
        if (gps.valid) ev.data.page.gui.map.setCenter(gps);
    });
    $('#centerDisplay').click({page:this},function(ev){
       ev.data.page.hideOverlay();
    });
    $('#aisInfo').click({page:this},function(ev){
        ev.data.page.gui.showPage('aispage');
    });
};

/**
 * @private
 * @param {Array.<string>} opt_names
 */
avnav.gui.Navpage.prototype.fillDisplayFromGps=function(opt_names){
    if (! this.navobject) return;
    var names=opt_names||this.navobject.getValueNames();
    for (var i=0;i< names.length;i++){
        this.getDiv().find('.avd_'+names[i]).text(this.navobject.getValue(names[i]));
    }
    if (this.navobject.getRawData(avnav.nav.NavEventType.GPS).valid){
        $('#boatPositionStatus').attr('src',this.gui.properties.getProperties().statusOkImage);
    }
    else {
        $('#boatPositionStatus').attr('src',this.gui.properties.getProperties().statusErrorImage);
    }
    if (this.navobject.getRoutingData().getApproaching()){
        $('#avi_route_display').addClass('avn_route_display_approach');
    }
    else {
        $('#avi_route_display').removeClass('avn_route_display_approach');
    }
};

/**
 * update the AIS panel
 */
avnav.gui.Navpage.prototype.updateAisPanel=function() {
    if (!this.gui.properties.getProperties().layers.ais) return;
    var aisPanel = this.getDiv().find('.avn_aisInfo');
    if (aisPanel) {
        var nearestTarget = this.navobject.getAisData().getNearestAisTarget();
        if (nearestTarget.mmsi) {
            //should show the AIS panel
            if (this.showHideAdditionalPanel('#aisInfo', true, '#' + this.mapdom))
                this.gui.map.updateSize();
            var displayClass = "avn_ais_info_first";
            var warningClass = "avn_ais_info_warning";
            if (!nearestTarget.warning) {
                $('#aisInfo').removeClass(warningClass);
                if (nearestTarget.nearest) $('#aisInfo').addClass(displayClass);
                else $('#aisInfo').removeClass(displayClass);
            }
            else {
                $('#aisInfo').addClass(warningClass);
                $('#aisInfo').removeClass(displayClass);
            }
        }
        else {
            if (this.showHideAdditionalPanel('#aisInfo', false, '#' + this.mapdom))
                this.gui.map.updateSize();
        }
    }
};

/**
 *
 * @param {avnav.nav.NavEvent} evdata
 */
avnav.gui.Navpage.prototype.navEvent=function(evdata){
    if (! this.visible) return;
    if (evdata.type == avnav.nav.NavEventType.AIS){
        this.updateAisPanel();
    }
    if (evdata.type == avnav.nav.NavEventType.ROUTE){
        this.handleRouteDisplay();
    }
    this.fillDisplayFromGps(evdata.changedNames);
};
/**
 *
 * @param {avnav.map.MapEvent} evdata
 */
avnav.gui.Navpage.prototype.mapEvent=function(evdata){
    if (! this.visible) return;
    if (evdata.type == avnav.map.EventType.MOVE) {
        //show the center display if not visible
        if (this.overlay != null) {
            this.hidetime = new Date().getTime() + this.gui.properties.getProperties().centerDisplayTimeout;
            return;
        }
        this.overlay = this.getDiv().find('#centerDisplay');
        this.hidetime = new Date().getTime() + this.gui.properties.getProperties().centerDisplayTimeout;
        this.overlay.show();
        this.handleRouteDisplay();
    }
    if (evdata.type == avnav.map.EventType.SELECTAIS){
        var aisparam=evdata.parameter.aisparam;
        if (! aisparam) return;
        if (aisparam.mmsi){
            this.navobject.getAisData().setTrackedTarget(aisparam.mmsi);
            this.gui.showPage('aispage');
        }
    }
};

/**
 * hide the center overlay
 */
avnav.gui.Navpage.prototype.hideOverlay=function(){
    if (this.overlay != null){
        this.overlay.hide();
        this.overlay=null;
        this.hidetime=0;
        this.handleRouteDisplay();
    }
};

avnav.gui.Navpage.prototype.showRouting=function() {
    if (this.routingVisible) return;
    this.showHideAdditionalPanel('#avi_second_buttons_navpage', true, '#' + this.mapdom);
    this.showHideAdditionalPanel('#avi_route_info_navpage', true, '#' + this.mapdom);
    this.routingVisible=true;
    this.handleToggleButton('#avb_ShowRoutePanel',true);
    this.gui.map.setRoutingActive(true);
    this.handleRouteDisplay();
};

/**
 * @private
 */
avnav.gui.Navpage.prototype.hideRouting=function() {
    this.showHideAdditionalPanel('#avi_second_buttons_navpage', false, '#' + this.mapdom);
    this.showHideAdditionalPanel('#avi_route_info_navpage', false, '#' + this.mapdom);
    this.routingVisible=false;
    this.handleToggleButton('#avb_ShowRoutePanel',false);
    this.gui.map.setRoutingActive(false);
    this.handleRouteDisplay();
};

avnav.gui.Navpage.prototype.handleRouteDisplay=function() {
    var routeActive=this.navobject.getRoutingData().getCurrentRoute().active;
    if (routeActive && ! this.routingVisible){
        $('#avi_route_display').show();
        if (this.overlay){
            var h=this.overlay.height();
            $('#avi_route_display').css('bottom',h);
        }
        else{
            $('#avi_route_display').css('bottom',0);
        }
    }
    else {
        $('#avi_route_display').hide();
    }
};


//-------------------------- Buttons ----------------------------------------

avnav.gui.Navpage.prototype.btnZoomIn=function (button,ev){
    log("ZoomIn clicked");
    this.getMap().changeZoom(1);
};

avnav.gui.Navpage.prototype.btnZoomOut=function (button,ev){
    log("ZoomOut clicked");
    this.getMap().changeZoom(-1);
};
avnav.gui.Navpage.prototype.btnLockPos=function (button,ev){
    var nLock=! this.gui.map.getGpsLock();
    this.gui.map.setGpsLock(nLock);
    this.handleToggleButton(button,nLock);
    if (nLock) this.hideOverlay();
    this.gui.map.triggerRender();
    log("LockPos clicked");
};
avnav.gui.Navpage.prototype.btnLockMarker=function (button,ev){
    var nLock=! this.navobject.getRoutingData().getLock();
    if (! nLock) this.navobject.getRoutingData().routeOff();
    else this.navobject.getRoutingData().routeOn(avnav.nav.RoutingMode.CENTER);
    this.handleToggleButton(button,nLock);
    this.gui.map.triggerRender();
    log("LockMarker clicked");
};
avnav.gui.Navpage.prototype.btnCourseUp=function (button,ev){
    var nLock=! this.gui.map.getCourseUp();
    nLock=this.gui.map.setCourseUp(nLock);
    this.handleToggleButton(button,nLock);
    this.gui.map.triggerRender();
    log("courseUp clicked");
};
avnav.gui.Navpage.prototype.btnShowRoutePanel=function (button,ev){
    log("showRoutePanel clicked");
    if (! this.routingVisible) this.showRouting();
    else this.hideRouting();
};
avnav.gui.Navpage.prototype.btnCancelNav=function (button,ev){
    log("CancelNav clicked");
    this.gui.showPage('mainpage');
};

//-------------------------- Route ----------------------------------------
avnav.gui.Navpage.prototype.btnNavAdd=function (button,ev){
    log("navAdd clicked");
    var center=this.gui.map.getCenter();
    var current=this.navobject.getRoutingData().getActiveWp();
    if (current) {
        var dst = this.gui.map.pixelDistance(center, current);
        //TODO: make this configurable
        if (dst < 8) return; //avoid multiple wp at the same coordinate
    }
    this.navobject.getRoutingData().addWp(
        -1,center
    );
};

avnav.gui.Navpage.prototype.btnNavDelete=function (button,ev){
    log("navDelete clicked");
    this.navobject.getRoutingData().deleteWp(-1);
};
avnav.gui.Navpage.prototype.btnNavToCenter=function (button,ev){
    log("navDelete clicked");
    var center=this.gui.map.getCenter();
    this.navobject.getRoutingData().changeWp(
        -1,center
    );
};
avnav.gui.Navpage.prototype.btnNavGoto=function(button,ev){
    log("navGoto clicked");
    this.navobject.getRoutingData().routeOn(avnav.nav.RoutingMode.ROUTE);
    this.hideRouting();
};
avnav.gui.Navpage.prototype.btnNavDeleteAll=function(button,ev){
    log("navDeletAll clicked");
    this.navobject.getRoutingData().deleteRoute();
};
/**
 * create the page instance
 */
(function(){
    //create an instance of the status page handler
    var page=new avnav.gui.Navpage();
}());

