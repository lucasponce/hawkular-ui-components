/// <reference path="../../includes.ts"/>
/// <reference path="alertsGlobals.ts"/>
module HawkularAlerts {

  export var _module = angular.module(HawkularAlerts.pluginName, ['ui.bootstrap', 'ui.select', 'hawkular.services']);

  var tab:any = undefined;

  _module.config(['$locationProvider', '$routeProvider', 'HawtioNavBuilderProvider', ($locationProvider, $routeProvider:ng.route.IRouteProvider, builder:HawtioMainNav.BuilderFactory) => {
    tab = builder.create()
      .id(HawkularAlerts.pluginName)
      .title(() => "Alerts")
      .href(() => "/alerts")
      .subPath("Dashboard", "dashboard", builder.join(HawkularAlerts.templatePath, 'dashboard.html'))
      .subPath("Definitions", "definitions", builder.join(HawkularAlerts.templatePath, 'definitions.html'))
      .subPath("Notifiers", "notifiers", builder.join(HawkularAlerts.templatePath, 'notifiers.html'))
      .build();
    builder.configureRouting($routeProvider, tab);

    $locationProvider.html5Mode(true);
  }]);

  _module.run(['HawtioNav', (HawtioNav:HawtioMainNav.Registry) => {
    HawtioNav.add(tab);
  }]);

  hawtioPluginLoader.addModule(HawkularAlerts.pluginName);
}
