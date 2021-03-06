/// Copyright 2014-2015 Red Hat, Inc. and/or its affiliates
/// and other contributors as indicated by the @author tags.
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///   http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.

/// <reference path="metricsPlugin.ts"/>
/// <reference path="../../includes.ts"/>

module HawkularMetrics {

  export interface IContextChartDataPoint {
    timestamp: number;
    value: number;
    avg: number;
    empty: boolean;
  }

  export interface IChartDataPoint extends IContextChartDataPoint {
    date: Date;
    min: number;
    max: number;
  }


  export var sharedMetricId:string;

  /**
   * @ngdoc controller
   * @name ChartController
   * @description This controller is responsible for handling activity related to the Chart tab.
   * @param $scope
   * @param $rootScope for publishing $broadcast events only
   * @param $interval
   * @param $log
   * @param metricDataService
   */
  export class MetricsViewController {
    /// for minification only
    public static  $inject = ['$scope', '$rootScope', '$interval', '$log', 'HawkularMetric', 'HawkularInventory'];

    constructor(private $scope:any,
                private $rootScope:ng.IRootScopeService,
                private $interval:ng.IIntervalService,
                private $log:ng.ILogService,
                private HawkularMetric:any,
                private HawkularInventory:any,
                public startTimeStamp:Date,
                public endTimeStamp:Date,
                public dateRange:string) {
      $scope.vm = this;

      this.startTimeStamp = moment().subtract(1, 'hours').toDate();
      this.endTimeStamp = new Date();
      this.dateRange = moment(this.startTimeStamp).format('H:mm') + ' - ' + moment(this.endTimeStamp).format('H:mm')
      + ' (' + moment(this.endTimeStamp).from(moment(this.startTimeStamp), true) + ')';

      $scope.$on('RefreshChart', (event) => {
        $scope.vm.refreshChartDataNow(this.getMetricId());
      });

      $scope.$watch('vm.selectedResource', (resource) => {
        if (resource) {
          /// made a selection from url switcher
          globalResourceId = resource.id;
          $scope.vm.refreshChartDataNow(this.getMetricId());
        } else {
          /// case when coming from addUrl screen
          globalResourceList = this.HawkularInventory.Resource.query({tenantId: globalTenantId}).$promise.
            then((resources)=> {
              this.resourceList = resources;
              this.selectedResource = resources[resources.length - 1];
              $scope.vm.refreshChartDataNow(this.getMetricId());
            });
        }

      });
      $scope.vm.onCreate();
    }

    private bucketedDataPoints:IChartDataPoint[] = [];
    private contextDataPoints:IChartDataPoint[] = [];
    private chartData:any;
    private isResponseTab = true;
    private autoRefreshPromise:ng.IPromise<number>;
    private _resourceList = [];
    selectedResource;


    public get resourceList():string[] {
      return this._resourceList;
    }

    public set resourceList(newResourceList:string[]) {
      globalResourceList = newResourceList;
      this._resourceList = newResourceList;
    }

    private onCreate() {
      /// setup autorefresh for every minute
      this.autoRefresh(60);
      this.HawkularInventory.Resource.query({tenantId: globalTenantId}, (aResourceList) => {
        this.resourceList = aResourceList;
        this.selectedResource = this.resourceList[this.resourceList.length - 1];
        this.refreshChartDataNow(this.getMetricId());
      });
    }


    cancelAutoRefresh():void {
      this.$interval.cancel(this.autoRefreshPromise);
      toastr.info('Canceling Auto Refresh');
    }

    autoRefresh(intervalInSeconds:number):void {
      this.refreshHistoricalChartDataForTimestamp(this.getMetricId());
      this.autoRefreshPromise = this.$interval(()  => {
        this.endTimeStamp = new Date();
        this.refreshHistoricalChartDataForTimestamp(this.getMetricId());
      }, intervalInSeconds * 1000);

      this.$scope.$on('$destroy', () => {
        this.$interval.cancel(this.autoRefreshPromise);
      });
    }

    private noDataFoundForId(id:string):void {
      this.$log.warn('No Data found for id: ' + id);
      ///toastr.warning('No Data found for id: ' + id);
    }


    refreshChartDataNow(metricId:string, startTime?:Date):void {
      var adjStartTimeStamp:Date = moment().subtract('hours', 1).toDate(); //default time period set to 24 hours
      //this.$rootScope.$broadcast('MultiChartOverlayDataChanged');
      this.endTimeStamp = new Date();
      this.refreshHistoricalChartData(metricId, angular.isUndefined(startTime) ? adjStartTimeStamp : startTime, this.endTimeStamp);
    }

    refreshHistoricalChartData(metricId:string, startDate:Date, endDate:Date):void {
      this.refreshHistoricalChartDataForTimestamp(metricId, startDate.getTime(), endDate.getTime());
    }

    getMetricId():string {
      var metricId = this.isResponseTab ? MetricsViewController.getResourceDurationMetricId() : MetricsViewController.getResourceCodeMetricId();
      sharedMetricId = metricId;
      return metricId;
    }

    private static getResourceDurationMetricId() {
      return globalResourceId + '.status.duration';
    }

    private static getResourceCodeMetricId() {
      return globalResourceId + '.status.code';
    }

    getChartType():string {
      return this.isResponseTab ? 'hawkulararea' : 'histogram';
    }

    getYAxisUnits():string {
      return this.isResponseTab ? 'Response time (ms)' : 'Status Code';
    }

    responseTabClick():void {
      this.isResponseTab = !this.isResponseTab;
      this.refreshChartDataNow(this.getMetricId());
    }

    refreshHistoricalChartDataForTimestamp(metricId:string, startTime?:number, endTime?:number):void {
      // calling refreshChartData without params use the model values
      if (!endTime) {
        endTime = this.endTimeStamp.getTime();
      }
      if (!startTime) {
        startTime = this.startTimeStamp.getTime();
      }

      if (metricId) {
        this.HawkularMetric.NumericMetricData.queryMetrics({
          tenantId: globalTenantId,
          numericId: metricId,
          start: startTime,
          end: endTime,
          buckets: 60
        }).$promise
          .then((response) => {
            // we want to isolate the response from the data we are feeding to the chart
            this.bucketedDataPoints = this.formatBucketedChartOutput(response);
            console.dir(this.bucketedDataPoints);

            if (this.bucketedDataPoints.length) {
              // this is basically the DTO for the chart
              this.chartData = {
                id: metricId,
                startTimeStamp: this.startTimeStamp,
                endTimeStamp: this.endTimeStamp,
                dataPoints: this.bucketedDataPoints,
                contextDataPoints: this.contextDataPoints,
                annotationDataPoints: []
              };

            } else {
              this.noDataFoundForId(this.getMetricId());
            }

          }, (error) => {
            this.$log.error('Error Loading Chart data');
            toastr.error('Error Loading Chart Data: ' + error);
          });

      }
    }

    private formatBucketedChartOutput(response):IChartDataPoint[] {
      //  The schema is different for bucketed output
      return _.map(response.data, (point:IChartDataPoint) => {
        return {
          timestamp: point.timestamp,
          date: new Date(point.timestamp),
          value: !angular.isNumber(point.value) ? 0 : point.value,
          avg: (point.empty) ? 0 : point.avg,
          min: !angular.isNumber(point.min) ? 0 : point.min,
          max: !angular.isNumber(point.max) ? 0 : point.max,
          empty: point.empty
        };
      });
    }

  }

  _module.controller('MetricsViewController', MetricsViewController);


}
