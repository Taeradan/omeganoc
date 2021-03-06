/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
 * Nicolas Lantoing, nicolas@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define(['jquery', 'dashboards.widget', 'console', 'onoc.createurl', 'gridster', 'jquery.hashchange', 'onoc.message'], function (jQuery, Widget, Console, createUrl) {
    /**
     * Manages the user's dashboards data and display
     * @property {Gridster} gridster         - Handle parts size and position
     * @property {DOMElement} element        - Dashboards content main container
     * @property {String} currentDashboard   - Current dashboard name.
     * @property {Number} lastAssignedTempID - Last temporary ID given (each time we add a new widget until the server return the definitive one
     * @property {Object} currentParts       - Store part's configurations
     */
    var DashboardsManager = {
        gridster: null,
        element: null,
        currentDashboard: "",
        lastAssignedTempID: 0,
        currentParts: {}, // A list of all the currently displayed parts data, indexed by part ID

        /**
         * Create new widgets container
         */
        _createWidgetContainer: function () {
            var result = jQuery('<li />');
            return result;
        },

        /**
         * Init function
         * @property {DOMElement} target - define @element
         */
        init: function (target) {
            DashboardsManager.element = target;

            // Initialize the central message
            jQuery('#dashboard-big-msg').onocMessage();

            // Initialize Gridster
            DashboardsManager.gridster = target.gridster({
                widget_margins: [10, 10],
                widget_base_dimensions: [100, 100],
		resize: {
		    'enabled': true
                    //'min_size': [4, 4]
		}
            }).data('gridster');

            $(window).resize(function () {
                // Update gridster's grid to match the new window dimentions
                DashboardsManager.gridster.recalculate_faux_grid();
            });

            var eParent = target.parent();
            eParent.on('gridster:dragstart', function () {
                // Update the containing scrollbar
                $(document).trigger('updatescrollbar.onoc');
            });

            eParent.on('gridster:dragstop', function () {
                // Update the containing scrollbar
                $(document).trigger('updatescrollbar.onoc');

                // Scan to check whose elements moved; save new positions
                DashboardsManager._scanChangedPositions();
            });

            eParent.on('gridster:resizestop', function () {
                // Update the containing scrollbar
                $(document).trigger('updatescrollbar.onoc');

                // Scan to check whose elements moved; save new positions
                DashboardsManager._scanChangedSize();
                DashboardsManager._scanChangedPositions();
            });

            // Listen for URL changes
            jQuery(window).hashchange(function () {
                var hash = decodeURIComponent(location.hash.substring(1));

                DashboardsManager.loadDashboard(hash);
            });

            // Load the initial dashboard
            var firstDashboard = this.readDashboardNameFromUrl();

            if (firstDashboard) {
                DashboardsManager.loadDashboard(firstDashboard);
            }
            else {
                DashboardsManager._setNoDashboardMessage('Please select a dashboard using the top menu');
            }
        },

        /**
         * Return any dashboard's name present in the URL
         */
        readDashboardNameFromUrl: function () {
            if (window.location.hash) {
                return window.location.hash.slice(1);
            }
            else {
                return "";
            }
        },

        /**
         * Loads the specified dashboard and displays it on screen
         * @param {String} dashboardName
         */
        loadDashboard: function (dashboardName) {
            // Do we have to change ?
            if (dashboardName === DashboardsManager.currentDashboard)
                return;

            DashboardsManager.unloadDashboard();
            DashboardsManager._setNoDashboardMessage('Loading...');

            DashboardsManager._loadDashboardData(dashboardName, function (data) {
                DashboardsManager._setNoDashboardMessage('');
                // Iterate over all the parts and create them
                jQuery.each(data, function (index, value) {
                    Widget.getWidgetById(value.widget, function (widget) {
                        if (!widget)
                            return;

                        DashboardsManager._createPart(value, widget, false);
                    });
                });

                // Update the scroll bar
                $(document).trigger('updatescrollbar.onoc');

                // Update the dashboard title
                DashboardsManager._setDashboardTitle(dashboardName);
                DashboardsManager._showDashboardControls(true);
            }, function (errorCode, errorText) {
                if (errorCode == 404) {
                    DashboardsManager._setNoDashboardMessage('The specified dashboard could not be found on the server');
                }
                else {
                    DashboardsManager._setNoDashboardMessage('An error occured while retrieving the dashboard.');
                    Console.error('Dashboard loading error : ' + errorCode + ' / ' + errorText);
                }
            });

            DashboardsManager.currentDashboard = dashboardName;
        },

        /**
         * Create a new Dashboard
         * @param {String} name          - The new dashboard name
         * @param {String} initialWidget - Intialize the new dashboard with this widget
         */
        createDashboard: function(name, initialWidget) {
            DashboardsManager.unloadDashboard();
            DashboardsManager.currentDashboard = name;
            DashboardsManager._setNoDashboardMessage('');

            DashboardsManager.buildWidget(initialWidget);

            DashboardsManager._setDashboardTitle(name);
            DashboardsManager._addTopMenuEntry(name);
            DashboardsManager._showDashboardControls(true);
        },

        /**
	 * Build a new widget
         * @param {String} widgetName - The widget we need to create
         */
	buildWidget: function(widgetName){
            Widget.getWidgetById(widgetName, function (widget) {
                if (!widget)
                    return;

                // Create the part with its default values
                widget.createDefaultData(this);
            }.bind(this));
	},

        /**
         * Add a new part to the current dashboard
         * @param {Object} partData - Part's configuration
         * @param {Object} widget - Part's widget instance
         */
	addWidget: function (partData, widget) {
            partData.id = DashboardsManager._createTemporaryID();
            partData.dashboard = DashboardsManager.currentDashboard;

	    //GRUICK!
	    partData.conf = JSON.stringify(partData.conf);
	    DashboardsManager.savePartData(partData,function(partData){
                if(partData.conf)
		    partData.conf = JSON.parse(partData.conf);
                DashboardsManager._createPart(partData, widget,false);
                DashboardsManager._scanChangedPositions();
	    });
        },

        /**
         * Remove a part from the dashboard
         * @param {DOMElement} part - The part's container
         */
        closePart: function(part) {
            if (!(part instanceof jQuery)) {
                part = jQuery('[data-part-id=' + part + ']');
            }

            var pid = parseInt(part.data('part-id'), 10);

            DashboardsManager.gridster.remove_widget(part, function () {
                DashboardsManager._scanChangedPositions();
            });
            delete DashboardsManager.currentParts[pid];
            // Save the removal
            jQuery.ajax(createUrl('/dashboards/part/' + pid), {
                type: 'DELETE'
            });
        },

        /**
         * Rename the current dashboard
         * @param {String} newName
         */
        renameCurrentDashboard: function(newName) {
            // Rename in the local widgets
            for (var k in DashboardsManager.currentParts) {
                DashboardsManager.currentParts[k].dashboard = newName;
            }

            // Rename on the server
            jQuery.post(createUrl('/dashboards'), {
                'oldname': DashboardsManager.currentDashboard,
                'newname': newName
            });

            // Rename in the dashboard title
            DashboardsManager._setDashboardTitle(newName);

            // Rename in the main menu
            DashboardsManager._editTopMenuEntry(DashboardsManager.currentDashboard, newName);

            DashboardsManager.currentDashboard = newName;

            // Change the URL
            window.location.hash = encodeURIComponent(newName);
        },

        /**
         * Return a new temporary ID
         */
        _createTemporaryID: function() {
            return --DashboardsManager.lastAssignedTempID;
        },

        /**
         * Internal logic for displaying a part
         * @param {Object} partData          - Part's config
         * @param {Object} widget            - Part's widget
         * @param {Boolean} autoUpdateScroll - Define if we need to update the scrollbar
         */
        _createPart: function (partData, widget, autoUpdateScroll) {
            autoUpdateScroll = !autoUpdateScroll;
            var container = DashboardsManager._createWidgetContainer(widget);
            container.attr('data-part-id', partData.id);
            partData.controller = widget.fillPart(container, partData, DashboardsManager);
            //big problems can happen if the _createPart is called before the previous dashboard is entirly removed (fadeout animation)
            try
            {
                DashboardsManager.gridster.add_widget(container[0], partData.width, partData.height, partData.col, partData.row);
                if (autoUpdateScroll) {
                    $(document).trigger('updatescrollbar.onoc');
                }
            }
            catch(e){
                console.log('Oh sh....');
                console.error(e,e.stack);
                location.reload(true);
            }

            DashboardsManager.currentParts[partData.id] = partData;
        },

        /**
         * Changes the displayed dasoboard title
         * TODO: herrrr third method related to dashboard reneaming stuff, removeme
         * @param {String} title
         */
        _setDashboardTitle: function (title) {
            jQuery('#dashboard-title').text(title);
        },

        /**
         * Loads dashboard's data from the server
         * @param {String} dashboardId     - Dashboard's id (ATM dashboard's name are used as their ID)
         * @param {Function} callback      - Callback to be called on success
         * @param {Function} errorCallback - Callback to be called on failure
         */
        _loadDashboardData: function (dashboardId, callback, errorCallback) {
            var url = createUrl('/dashboards/details/' + dashboardId);
            jQuery.getJSON(url).done(function (data) {
                callback(data);
            }).fail(function (jqXhr, textStatus, errorThrown) {
                if (errorCallback) {
                    errorCallback(jqXhr.status, textStatus);
                }
            });
        },

        /**
        * Gets the height in pixels of a part area.
        * The includeHeader argument is a boolean. If true, the entire part height is returned.
        * Otherwise the height with the title area excluded is returned. Default is false.
        * @param {Number} numRows        - Height value from gridster
        * @param {Boolean} includeHeader
        */
        getPartHeight: function (numRows, includeHeader) {
            includeHeader = !!includeHeader;
            var g = DashboardsManager.gridster;
            var result = (numRows * g.options.widget_base_dimensions[1]) + ((numRows - 1) * 2 * g.options.widget_margins[1]);
            if (!includeHeader) {
                result -= 90;
            }

            return result;
        },

        /**
         * Gets the width in pixels of a part area.
         * @param {Number} numCols - Width value from gridster
         */
        getPartWidth: function (numCols) {
            var g = DashboardsManager.gridster;
            return (numCols * g.options.widget_base_dimensions[0]) + ((numCols - 1) * 2 * g.options.widget_margins[0]);
        },

        /**
         * Gets the position of a part container {col: <column>, row: <row>}
         * The function accepts either a part ID or the part container as a jQuery object
         */
        getPartPosition: function (part) {
            var elm = part;
            if (!(elm instanceof jQuery)) {
                elm = jQuery('[data-part-id=' + part + ']');
            }
            return {
                row: parseInt(elm.attr('data-row'), 10),
                col: parseInt(elm.attr('data-col'), 10),
		width: parseInt(elm.attr('data-sizex'), 10),
		height: parseInt(elm.attr('data-sizey'), 10)
            };
        },

        /**
         * Check if any part got a new position and save it
         */
        _scanChangedPositions: function () {
            DashboardsManager.element.find(' > li').each(function (i, e) {
                var jqe = jQuery(e);
                var pid = parseInt(jqe.attr('data-part-id'), 10);
                var curPos = DashboardsManager.getPartPosition(jqe);
                var pData = DashboardsManager.currentParts[pid] || {};
                if (pData.col != curPos.col || pData.row != curPos.row) {
                    // Apply and save
                    // TODO : Replace this with a single-request

                    pData.col = curPos.col;
                    pData.row = curPos.row;

                    DashboardsManager.savePartData({
                        id: pData.id,
                        row: pData.row,
                        col: pData.col
                    });
                }
            });

        },

        /**
         * Check if any part got a new size and save it
         */
        _scanChangedSize: function () {
            DashboardsManager.element.find(' > li').each(function (i, e) {
                var jqe = jQuery(e);
                var pid = parseInt(jqe.attr('data-part-id'), 10);
                var curPos = DashboardsManager.getPartPosition(jqe);
                var pData = DashboardsManager.currentParts[pid] || {};
                if (pData.width != curPos.width || pData.height != curPos.height) {
                    // Apply and save
                    // TODO : Replace this with a single-request batched save
		    pData.width = curPos.width;
		    pData.height = curPos.height;

                    DashboardsManager.savePartData({
                        id: pData.id,
			width: pData.width,
			height: pData.height
                    });
                    //TODO: REFACTOR
                    if(pData.controller.chart)
		        pData.controller.chart.updateBoxSize(pData.width,pData.height);
                    if(pData.controller.resize)
                        pData.controller.resize(pData.width,pData.height);
                }
            });

        },

        /**
         * Save part configuration
         * @param {Object} partData   - Part config
         * @param {Function} callback
         */
        savePartData: function (partData,callback) {
            var url = createUrl('/dashboards/part');
            if(!partData.id && !partData.conf)
                return false;
            jQuery.post(url, partData, function (data, statusText, jqXHR) {
                if (data.original_id != data.saved_id) {
                    DashboardsManager._applyDefinitivePartId(data.original_id, data.saved_id);
		    partData.id = data.saved_id;
                }
		if(callback)
		    callback(partData);
            }, 'json');
        },

        /**
         * Update a part with his definitive ID
         * @param {Number} oldId - old temporary ID
         * @param {Number} newId - New ID returned by the server
         */
        _applyDefinitivePartId: function (oldId, newId){
            var elm = jQuery('[data-part-id=' + oldId + ']');
            elm.attr('data-part-id', newId);
            if (oldId in DashboardsManager.currentParts) {
                DashboardsManager.currentParts[newId] = DashboardsManager.currentParts[oldId];
                delete DashboardsManager.currentParts[oldId];
                DashboardsManager.currentParts[newId].id = newId;
            }
        },

        /**
         * Unload a dashboard before loading a new one.
         */
        unloadDashboard: function () {
            DashboardsManager.currentParts = {};
            var parts = DashboardsManager.element.find(' > li').each(function (i, e) {
                DashboardsManager.gridster.remove_widget(e, true);
            });

            //scrollup to the top
            $('[data-scrollbar]').tinyscrollbar_update(0);
            DashboardsManager._showDashboardControls(false);
            //TODO: flush worker too
        },

        /**
         * Adds a new link in the "Dashboards" drop down menu
         * @param {String} name
         */
        _addTopMenuEntry: function (name) {
            var entryContainer = jQuery('#menu-dashboards-list');

            // Before adding the new entry, make sure that it does not contain the "no dashboards yet" entry
            // remove it if it's here
            var noentry = entryContainer.find('li.no-dashboard');
            noentry.remove();

            // We can now add the link
            var link = jQuery('<a></a>');
            link.text(name);
            link.attr('href', createUrl('/dashboards') + '#' + encodeURIComponent(name));
            var li = link.wrap('<li />').parent();
            entryContainer.append(li);
        },

        /**
         * Edit an entry from the Dashboards dropdown menu
         * @param {String} oldName
         * @param {String} newName
         */
        _editTopMenuEntry: function (oldName, newName) {
            var entries = jQuery('#menu-dashboards-list a');
            entries.each(function (i, elm) {
                var jqElm = jQuery(elm);
                if (jqElm.text() == oldName) {
                    jqElm.text(newName);
                    jqElm.attr('href', createUrl('/dashboards') + '#' + encodeURIComponent(newName));
                }
            });
        },

        /**
         * Sets the text of the big text displayed in the middle of the dashboards area.
         * Provide an empty string to hide it.
         * @param {String} text
         */
        _setNoDashboardMessage: function (text) {
            jQuery('#dashboard-big-msg').data('onocMessage').setText(text);
        },

        /**
         * Display or hide dashboard controls (Rename and addWidget buttons)
         * @param {Boolean} show
         */
        _showDashboardControls: function (show) {
            var controls = jQuery('#dashboard-controls');

            if (show)
                controls.fadeIn();
            else
                controls.fadeOut();
        }
    };

    return DashboardsManager;
});
