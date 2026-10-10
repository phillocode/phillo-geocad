from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import base64
import datetime
import io
import json
import math
import os
import re
import sqlite3
import tempfile
import zipfile

SCHEMA_SQL = r'''CREATE TABLE "AntennaTable" ("antennaID" INTEGER PRIMARY KEY AUTOINCREMENT ,"deviceID" TEXT,"model" TEXT,"h" REAL NOT NULL ,"r" REAL NOT NULL ,"hL1" REAL NOT NULL ,"hL2" REAL NOT NULL );
CREATE TABLE "BaseStationTable" ("baseStationID" INTEGER PRIMARY KEY AUTOINCREMENT ,"Model" TEXT,"Serial" TEXT,"AntennaType" TEXT,"AntennaHeight" REAL NOT NULL ,"AntennaMeasureMode" INTEGER NOT NULL ,"DataLink" TEXT,"StartMode" INTEGER NOT NULL ,"ProjectName" TEXT,"ProjectTime" TEXT);
CREATE TABLE "CadEntity" ("ID" INTEGER PRIMARY KEY AUTOINCREMENT ,"Name" TEXT,"Code" TEXT,"LayerID" INTEGER NOT NULL ,"EntityType" INTEGER NOT NULL ,"EntityColor" INTEGER NOT NULL ,"ValueDetails" BLOB,"Style" BLOB,"LineFinish" INTEGER NOT NULL ,"CoordSystemChanged" INTEGER NOT NULL );
CREATE TABLE "CadLayer" ("ID" INTEGER PRIMARY KEY AUTOINCREMENT ,"LayerName" TEXT,"LayerColor" INTEGER NOT NULL ,"Visible" INTEGER NOT NULL ,"Selectable" INTEGER NOT NULL ,"LineStyle" INTEGER NOT NULL );
CREATE TABLE "CorrectTable" ("correctID" INTEGER PRIMARY KEY AUTOINCREMENT ,"knownPointN" REAL NOT NULL ,"knownPointE" REAL NOT NULL ,"knownPointH" REAL NOT NULL ,"wgs84Latitude" REAL NOT NULL ,"wgs84Longitude" REAL NOT NULL ,"wgs84Altitude" REAL NOT NULL ,"dx" REAL NOT NULL ,"dy" REAL NOT NULL ,"dh" REAL NOT NULL ,"baseID" TEXT,"baseLatitude" REAL NOT NULL ,"baseLongitude" REAL NOT NULL ,"baseAltitude" REAL NOT NULL ,"correctTime" TEXT);
CREATE TABLE "EntityTable" ("entityID" INTEGER PRIMARY KEY AUTOINCREMENT ,"type" INTEGER NOT NULL ,"name" TEXT,"code" TEXT,"layerName" TEXT,"minNorth" REAL NOT NULL ,"minEast" REAL NOT NULL ,"minHeight" REAL NOT NULL ,"MaxNorth" REAL NOT NULL ,"MaxEast" REAL NOT NULL ,"MaxHeight" REAL NOT NULL ,"perimeter" REAL NOT NULL ,"acreage" REAL NOT NULL ,"isDeleted" INTEGER,"imageList" TEXT);
CREATE TABLE "GPSCoordTable" ("gpsID" INTEGER PRIMARY KEY AUTOINCREMENT ,"recordMode" INTEGER NOT NULL ,"wgs84Latitude" REAL NOT NULL ,"wgs84Longitude" REAL NOT NULL ,"wgs84Altitude" REAL NOT NULL ,"undulation" REAL NOT NULL ,"posState" TEXT,"posType" INTEGER NOT NULL ,"lbPosType" INTEGER NOT NULL ,"nrms" REAL NOT NULL ,"erms" REAL NOT NULL ,"vrms" REAL NOT NULL ,"pdop" REAL NOT NULL ,"hdop" REAL NOT NULL ,"vdop" REAL NOT NULL ,"satelliteSolution" INTEGER NOT NULL ,"satelliteView" INTEGER NOT NULL ,"satelliteDetail" TEXT,"diffAge" INTEGER NOT NULL ,"localTime" TEXT,"utcTime" TEXT,"velocity" REAL NOT NULL ,"direction" REAL NOT NULL ,"distanceBase" REAL NOT NULL ,"distanceBaseStdDev" REAL NOT NULL ,"baseID" TEXT,"baseLatitude" REAL NOT NULL ,"baseLongitude" REAL NOT NULL ,"baseAltitude" REAL NOT NULL ,"baseChangeCorrectX" REAL NOT NULL ,"baseChangeCorrectY" REAL NOT NULL ,"baseChangeCorrectH" REAL NOT NULL ,"baseChangeCorrectLatitude" REAL NOT NULL ,"baseChangeCorrectLongitude" REAL NOT NULL ,"baseChangeCorrectAltitude" REAL NOT NULL ,"mountPoint" TEXT,"baseTime" TEXT,"antMeasureMode" INTEGER NOT NULL ,"antMeasureHeight" REAL NOT NULL ,"antAntennaHeight" REAL NOT NULL ,"deviceID" TEXT,"antennaID" INTEGER,"pdaID" TEXT,"deviceModel" TEXT,"baseSN" TEXT,"baseModel" TEXT,"baseAntName" TEXT,"baseAntSN" TEXT,"baseAntHeight" REAL NOT NULL );
CREATE TABLE "GPSEpochTable" ("epochID" INTEGER PRIMARY KEY AUTOINCREMENT ,"gpsID" INTEGER,"recordMode" INTEGER NOT NULL ,"indexSmooth" INTEGER NOT NULL ,"totalSmooth" INTEGER NOT NULL ,"indexTimes" INTEGER NOT NULL ,"totalTimes" INTEGER NOT NULL ,"wgs84Latitude" REAL NOT NULL ,"wgs84Longitude" REAL NOT NULL ,"wgs84Altitude" REAL NOT NULL ,"undulation" REAL NOT NULL ,"posState" TEXT,"posType" INTEGER NOT NULL ,"lbPosType" INTEGER NOT NULL ,"nrms" REAL NOT NULL ,"erms" REAL NOT NULL ,"vrms" REAL NOT NULL ,"pdop" REAL NOT NULL ,"hdop" REAL NOT NULL ,"vdop" REAL NOT NULL ,"satelliteSolution" INTEGER NOT NULL ,"satelliteView" INTEGER NOT NULL ,"satelliteDetail" TEXT,"diffAge" INTEGER NOT NULL ,"localTime" TEXT,"utcTime" TEXT,"velocity" REAL NOT NULL ,"direction" REAL NOT NULL ,"distanceBase" REAL NOT NULL ,"distanceBaseStdDev" REAL NOT NULL ,"baseID" TEXT,"baseLatitude" REAL NOT NULL ,"baseLongitude" REAL NOT NULL ,"baseAltitude" REAL NOT NULL ,"baseChangeCorrectX" REAL NOT NULL ,"baseChangeCorrectY" REAL NOT NULL ,"baseChangeCorrectH" REAL NOT NULL ,"baseChangeCorrectLatitude" REAL NOT NULL ,"baseChangeCorrectLongitude" REAL NOT NULL ,"baseChangeCorrectAltitude" REAL NOT NULL ,"mountPoint" TEXT,"baseTime" TEXT,"antMeasureMode" INTEGER NOT NULL ,"antMeasureHeight" REAL NOT NULL ,"antAntennaHeight" REAL NOT NULL ,"deviceID" TEXT,"pdaID" TEXT,"deviceModel" TEXT,"covXX" REAL NOT NULL ,"covXY" REAL NOT NULL ,"covXZ" REAL NOT NULL ,"covYX" REAL NOT NULL ,"covYY" REAL NOT NULL ,"covYZ" REAL NOT NULL ,"covZX" REAL NOT NULL ,"covZY" REAL NOT NULL ,"covZZ" REAL NOT NULL ,"compensationType" INTEGER NOT NULL ,"pitch" REAL NOT NULL ,"roll" REAL NOT NULL ,"yaw" REAL NOT NULL ,"baseSN" TEXT,"baseModel" TEXT,"baseAntName" TEXT,"baseAntSN" TEXT,"baseAntHeight" REAL NOT NULL );
CREATE TABLE "ImageTable" ("imageID" INTEGER PRIMARY KEY AUTOINCREMENT ,"ptID" INTEGER,"image" BLOB,"filename" TEXT);
CREATE TABLE "PointTable" ("ptID" INTEGER PRIMARY KEY AUTOINCREMENT ,"name" TEXT,"code" TEXT,"latitude" REAL NOT NULL ,"longitude" REAL NOT NULL ,"altitude" REAL NOT NULL ,"n" REAL NOT NULL ,"e" REAL NOT NULL ,"h" REAL NOT NULL ,"coordinateType" INTEGER NOT NULL ,"pointType" INTEGER NOT NULL ,"isDeleted" INTEGER NOT NULL ,"gpsID" INTEGER,"entityID" INTEGER,"netConvertType" INTEGER NOT NULL ,"pdaID" TEXT,"elevMask" INTEGER NOT NULL ,"startTime" TEXT,"endTime" TEXT,"epochCount" INTEGER NOT NULL ,"targetPointID" INTEGER,"stakeoutSurveyPoint" INTEGER NOT NULL ,"stakeoutTimes" INTEGER NOT NULL ,"laserDistance" REAL NOT NULL ,"isCross" INTEGER NOT NULL ,"laserHRMS" REAL NOT NULL ,"laserVRMS" REAL NOT NULL ,"codeStyle" BLOB);
CREATE TABLE "Polyline" ("polylineID" INTEGER PRIMARY KEY AUTOINCREMENT ,"name" TEXT,"code" TEXT,"isClosed" INTEGER NOT NULL ,"length_2D" REAL NOT NULL ,"length_3D" REAL NOT NULL ,"isDeleted" INTEGER NOT NULL ,"note" TEXT);
CREATE TABLE "PolylinePoint" ("polylinePointID" INTEGER PRIMARY KEY AUTOINCREMENT ,"polylineID" INTEGER,"name" TEXT,"code" TEXT,"latitude" REAL NOT NULL ,"longitude" REAL NOT NULL ,"altitude" REAL NOT NULL ,"n" REAL NOT NULL ,"e" REAL NOT NULL ,"h" REAL NOT NULL ,"coordinateType" INTEGER NOT NULL ,"pointType" INTEGER NOT NULL ,"isDeleted" INTEGER NOT NULL ,"gpsID" INTEGER,"netConvertType" INTEGER NOT NULL ,"pdaID" TEXT,"elevMask" INTEGER NOT NULL ,"startTime" TEXT,"endTime" TEXT,"epochCount" INTEGER NOT NULL ,"targetPointID" INTEGER,"stakeoutSurveyPoint" INTEGER NOT NULL ,"stakeoutTimes" INTEGER NOT NULL ,"codeStyle" BLOB);
CREATE TABLE "StakeoutInfoTable" ("stakeoutID" INTEGER PRIMARY KEY AUTOINCREMENT ,"GPS_ID" INTEGER,"WORK_MODE" INTEGER NOT NULL ,"TARGET" TEXT,"DX" REAL NOT NULL ,"DY" REAL NOT NULL ,"DH" REAL NOT NULL ,"MILEAGE" REAL NOT NULL ,"DISTANCE" REAL NOT NULL ,"SUB_WORK_MODE" INTEGER NOT NULL ,"SUB_TARGET" TEXT,"SUB_DX" REAL NOT NULL ,"SUB_DY" REAL NOT NULL ,"SUB_DH" REAL NOT NULL ,"SUB_MILEAGE" REAL NOT NULL ,"SUB_DISTANCE" REAL NOT NULL ,"SUB_HORIZONTAL_DISTANCE" REAL NOT NULL ,"SUB_LINE_OFFSET" INTEGER NOT NULL ,"PDA_ID" TEXT,"STR_TOWER_BASE_PT_NAME" TEXT,"STR_TOWER_BASE_DMINDEX" TEXT);
CREATE TABLE "Surface" ("surfaceID" INTEGER PRIMARY KEY AUTOINCREMENT ,"name" TEXT,"code" TEXT,"isClosed" INTEGER NOT NULL ,"length_2D" REAL NOT NULL ,"length_3D" REAL NOT NULL ,"area" REAL NOT NULL ,"isDeleted" INTEGER NOT NULL ,"note" TEXT);
CREATE TABLE "SurfacePoint" ("surfacePointID" INTEGER PRIMARY KEY AUTOINCREMENT ,"surfaceID" INTEGER,"name" TEXT,"code" TEXT,"latitude" REAL NOT NULL ,"longitude" REAL NOT NULL ,"altitude" REAL NOT NULL ,"n" REAL NOT NULL ,"e" REAL NOT NULL ,"h" REAL NOT NULL ,"coordinateType" INTEGER NOT NULL ,"pointType" INTEGER NOT NULL ,"isDeleted" INTEGER NOT NULL ,"gpsID" INTEGER,"netConvertType" INTEGER NOT NULL ,"pdaID" TEXT,"elevMask" INTEGER NOT NULL ,"startTime" TEXT,"endTime" TEXT,"epochCount" INTEGER NOT NULL ,"targetPointID" INTEGER,"stakeoutSurveyPoint" INTEGER NOT NULL ,"stakeoutTimes" INTEGER NOT NULL ,"codeStyle" BLOB);
CREATE TABLE android_metadata (locale TEXT);'''
CTP = base64.b64decode("PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiID8+CjxIRUFEPgogICAgPEV4cGlyZURhdGU+CiAgICAgICAgPEV4cGlyZV9ZZWFyPjIwMTI8L0V4cGlyZV9ZZWFyPgogICAgICAgIDxFeHBpcmVfTW9udGg+MTwvRXhwaXJlX01vbnRoPgogICAgICAgIDxFeHBpcmVfRGF5PjE8L0V4cGlyZV9EYXk+CiAgICA8L0V4cGlyZURhdGU+CiAgICA8Q29vcmRpbmF0ZVN5c3RlbT4KICAgICAgICA8VmVyPjEuMTwvVmVyPgogICAgICAgIDxDb29yZFBhcmFUeXBlPjA8L0Nvb3JkUGFyYVR5cGU+CiAgICAgICAgPE5hbWU+RGVmYXVsdDwvTmFtZT4KICAgICAgICA8RWxsaXBzb2lkUGFyYW1ldGVyPgogICAgICAgICAgICA8TmFtZT5XR1MtODQ8L05hbWU+CiAgICAgICAgICAgIDxBeGlzPjYzNzgxMzcuMDAwMDAwMDAwMDAwMDAwMDwvQXhpcz4KICAgICAgICAgICAgPFJlY2lwcm9jYWxvZkZsYXRSYXRlPjI5OC4yNTcyMjM1NjMwMDAwMjUwPC9SZWNpcHJvY2Fsb2ZGbGF0UmF0ZT4KICAgICAgICA8L0VsbGlwc29pZFBhcmFtZXRlcj4KICAgICAgICA8UHJvamVjdFBhcmFtZXRlcj4KICAgICAgICAgICAgPFR5cGU+MjI4PC9UeXBlPgogICAgICAgICAgICA8Q2VudHJhbE1lcmlkaWFuPjAuMTU3MDc5NjMyNjc5NDg5NzwvQ2VudHJhbE1lcmlkaWFuPgogICAgICAgICAgICA8VHg+MC4wMDAwMDAwMDAwMDAwMDAwPC9UeD4KICAgICAgICAgICAgPFR5PjUwMDAwMC4wMDAwMDAwMDAwMDAwMDAwPC9UeT4KICAgICAgICAgICAgPFRLPjEuMDAwMDAwMDAwMDAwMDAwMDwvVEs+CiAgICAgICAgICAgIDxQcm9qZWN0aW9uSGVpZ2h0PjAuMDAwMDAwMDAwMDAwMDAwMDwvUHJvamVjdGlvbkhlaWdodD4KICAgICAgICAgICAgPFJlZmVyZW5jZUxhdGl0dWRlPjAuMDAwMDAwMDAwMDAwMDAwMDwvUmVmZXJlbmNlTGF0aXR1ZGU+CiAgICAgICAgICAgIDxQYXJhbGxlbDE+MC4wMDAwMDAwMDAwMDAwMDAwPC9QYXJhbGxlbDE+CiAgICAgICAgICAgIDxQYXJhbGxlbDI+MC4wMDAwMDAwMDAwMDAwMDAwPC9QYXJhbGxlbDI+CiAgICAgICAgICAgIDxBemltdXRoPjAuMDAwMDAwMDAwMDAwMDAwMDwvQXppbXV0aD4KICAgICAgICAgICAgPEdyaWRBbmdsZT4wLjAwMDAwMDAwMDAwMDAwMDA8L0dyaWRBbmdsZT4KICAgICAgICAgICAgPFNvdXRoPjA8L1NvdXRoPgogICAgICAgICAgICA8QXZlcmFnZUxhdGl0dWRlPjAuMDAwMDAwMDAwMDAwMDAwMDwvQXZlcmFnZUxhdGl0dWRlPgogICAgICAgIDwvUHJvamVjdFBhcmFtZXRlcj4KICAgICAgICA8U2V2ZW5QYXJhbWV0ZXI+CiAgICAgICAgICAgIDxVc2U+MDwvVXNlPgogICAgICAgICAgICA8TW9kZT4wPC9Nb2RlPgogICAgICAgICAgICA8RFg+MC4wMDAwMDAwMDAwMDAwMDAwPC9EWD4KICAgICAgICAgICAgPERZPjAuMDAwMDAwMDAwMDAwMDAwMDwvRFk+CiAgICAgICAgICAgIDxEWj4wLjAwMDAwMDAwMDAwMDAwMDA8L0RaPgogICAgICAgICAgICA8Ulg+MC4wMDAwMDAwMDAwMDAwMDAwPC9SWD4KICAgICAgICAgICAgPFJZPjAuMDAwMDAwMDAwMDAwMDAwMDwvUlk+CiAgICAgICAgICAgIDxSWj4wLjAwMDAwMDAwMDAwMDAwMDA8L1JaPgogICAgICAgICAgICA8Sz4wLjAwMDAwMDAwMDAwMDAwMDA8L0s+CiAgICAgICAgICAgIDxYMD4wLjAwMDAwMDAwMDAwMDAwMDA8L1gwPgogICAgICAgICAgICA8WTA+MC4wMDAwMDAwMDAwMDAwMDAwPC9ZMD4KICAgICAgICAgICAgPFowPjAuMDAwMDAwMDAwMDAwMDAwMDwvWjA+CiAgICAgICAgPC9TZXZlblBhcmFtZXRlcj4KICAgICAgICA8Rm91clBhcmFtZXRlcj4KICAgICAgICAgICAgPFVzZT4wPC9Vc2U+CiAgICAgICAgICAgIDxDeD4wLjAwMDAwMDAwMDAwMDAwMDA8L0N4PgogICAgICAgICAgICA8Q3k+MC4wMDAwMDAwMDAwMDAwMDAwPC9DeT4KICAgICAgICAgICAgPENhPjAuMDAwMDAwMDAwMDAwMDAwMDwvQ2E+CiAgICAgICAgICAgIDxDaz4xLjAwMDAwMDAwMDAwMDAwMDA8L0NrPgogICAgICAgICAgICA8T3JneD4wLjAwMDAwMDAwMDAwMDAwMDA8L09yZ3g+CiAgICAgICAgICAgIDxPcmd5PjAuMDAwMDAwMDAwMDAwMDAwMDwvT3JneT4KICAgICAgICA8L0ZvdXJQYXJhbWV0ZXI+CiAgICAgICAgPEhlaWdodEZpdHRpbmdQYXJhbWV0ZXI+CiAgICAgICAgICAgIDxVc2U+MDwvVXNlPgogICAgICAgICAgICA8YTA+MC4wMDAwMDAwMDAwMDAwMDAwPC9hMD4KICAgICAgICAgICAgPGExPjAuMDAwMDAwMDAwMDAwMDAwMDwvYTE+CiAgICAgICAgICAgIDxhMj4wLjAwMDAwMDAwMDAwMDAwMDA8L2EyPgogICAgICAgICAgICA8YTM+MC4wMDAwMDAwMDAwMDAwMDAwPC9hMz4KICAgICAgICAgICAgPGE0PjAuMDAwMDAwMDAwMDAwMDAwMDwvYTQ+CiAgICAgICAgICAgIDxhNT4wLjAwMDAwMDAwMDAwMDAwMDA8L2E1PgogICAgICAgICAgICA8eDA+MC4wMDAwMDAwMDAwMDAwMDAwPC94MD4KICAgICAgICAgICAgPHkwPjAuMDAwMDAwMDAwMDAwMDAwMDwveTA+CiAgICAgICAgICAgIDxTdHJpY3RNb2RlPjA8L1N0cmljdE1vZGU+CiAgICAgICAgPC9IZWlnaHRGaXR0aW5nUGFyYW1ldGVyPgogICAgICAgIDxDb3JyZWN0UGFyYW1ldGVyPgogICAgICAgICAgICA8VXNlPjA8L1VzZT4KICAgICAgICAgICAgPER4PjAuMDAwMDAwMDAwMDAwMDAwMDwvRHg+CiAgICAgICAgICAgIDxEeT4wLjAwMDAwMDAwMDAwMDAwMDA8L0R5PgogICAgICAgICAgICA8RGg+MC4wMDAwMDAwMDAwMDAwMDAwPC9EaD4KICAgICAgICA8L0NvcnJlY3RQYXJhbWV0ZXI+CiAgICAgICAgPFZlcnRpY2FsUGFyYW1ldGVyPgogICAgICAgICAgICA8VXNlPjA8L1VzZT4KICAgICAgICAgICAgPE1vZGU+MTwvTW9kZT4KICAgICAgICAgICAgPE9yZ3g+MC4wMDAwMDAwMDAwMDAwMDAwPC9Pcmd4PgogICAgICAgICAgICA8T3JneT4wLjAwMDAwMDAwMDAwMDAwMDA8L09yZ3k+CiAgICAgICAgICAgIDxESD4wLjAwMDAwMDAwMDAwMDAwMDA8L0RIPgogICAgICAgICAgICA8Tm9ydGhTbG9wZT4wLjAwMDAwMDAwMDAwMDAwMDA8L05vcnRoU2xvcGU+CiAgICAgICAgICAgIDxFYXN0U2xvcGU+MC4wMDAwMDAwMDAwMDAwMDA8L0Vhc3RTbG9wZT4KICAgICAgICA8L1ZlcnRpY2FsUGFyYW1ldGVyPgogICAgICAgIDxTTj4KICAgICAgICAgICAgPFBEQVNOPjwvUERBU04+CiAgICAgICAgPC9TTj4KICAgICAgICA8R2VvaWRQYXJhbWV0ZXI+CiAgICAgICAgICAgIDxVc2U+MDwvVXNlPgogICAgICAgICAgICA8TW9kZT4wPC9Nb2RlPgogICAgICAgICAgICA8R2VvaWRGaWxlPjwvR2VvaWRGaWxlPgogICAgICAgIDwvR2VvaWRQYXJhbWV0ZXI+CiAgICAgICAgPEdyaWRQYXJhbWV0ZXI+CiAgICAgICAgICAgIDxVc2U+MDwvVXNlPgogICAgICAgICAgICA8R3JpZEZpbGU+PC9HcmlkRmlsZT4KICAgICAgICAgICAgPEdyaWRHS0ZpbGVNb2RlPi0xPC9HcmlkR0tGaWxlTW9kZT4KICAgICAgICAgICAgPEdyaWRHS0ZpbGVQYXRoPjwvR3JpZEdLRmlsZVBhdGg+CiAgICAgICAgPC9HcmlkUGFyYW1ldGVyPgogICAgICAgIDxHcmlkSGVpZ2h0UGFyYW1ldGVyPgogICAgICAgICAgICA8VXNlPjA8L1VzZT4KICAgICAgICAgICAgPEdyaWRGaWxlPjwvR3JpZEZpbGU+CiAgICAgICAgICAgIDxTcmNHcmlkRmlsZT48L1NyY0dyaWRGaWxlPgogICAgICAgIDwvR3JpZEhlaWdodFBhcmFtZXRlcj4KICAgICAgICA8SVRSRlBhcmFtZXRlcj4KICAgICAgICAgICAgPFVzZT4wPC9Vc2U+CiAgICAgICAgICAgIDxUeXBlPjA8L1R5cGU+CiAgICAgICAgICAgIDxTcmNFcGg+MjAwMC4wMDA8L1NyY0VwaD4KICAgICAgICAgICAgPElucHV0VmVsb2NpdHk+MDwvSW5wdXRWZWxvY2l0eT4KICAgICAgICAgICAgPFZlbG9jaXR5WD4wLjAwMDAwMDwvVmVsb2NpdHlYPgogICAgICAgICAgICA8VmVsb2NpdHlZPjAuMDAwMDAwPC9WZWxvY2l0eVk+CiAgICAgICAgICAgIDxWZWxvY2l0eVo+MC4wMDAwMDA8L1ZlbG9jaXR5Wj4KICAgICAgICA8L0lUUkZQYXJhbWV0ZXI+CiAgICAgICAgPFBvbHlub21lUGFyYT4KICAgICAgICAgICAgPFVzZT4wPC9Vc2U+CiAgICAgICAgICAgIDxPcmlTcmNfTj4wLjAwMDAwMDAwPC9PcmlTcmNfTj4KICAgICAgICAgICAgPE9yaVRhcmdldF9OPjAuMDAwMDAwMDA8L09yaVRhcmdldF9OPgogICAgICAgICAgICA8UjE+MC4wMDAwMDAwMDwvUjE+CiAgICAgICAgICAgIDxBMT4wLjAwMDAwMDAwPC9BMT4KICAgICAgICAgICAgPEEyPjAuMDAwMDAwMDA8L0EyPgogICAgICAgICAgICA8QTM+MC4wMDAwMDAwMDwvQTM+CiAgICAgICAgICAgIDxBND4wLjAwMDAwMDAwPC9BND4KICAgICAgICAgICAgPEE1PjAuMDAwMDAwMDA8L0E1PgogICAgICAgICAgICA8T3JpU3JjX0U+MC4wMDAwMDAwMDwvT3JpU3JjX0U+CiAgICAgICAgICAgIDxPcmlUYXJnZXRfRT4wLjAwMDAwMDAwPC9PcmlUYXJnZXRfRT4KICAgICAgICAgICAgPFIyPjAuMDAwMDAwMDAwPC9SMj4KICAgICAgICAgICAgPEIxPjAuMDAwMDAwMDA8L0IxPgogICAgICAgICAgICA8QjI+MC4wMDAwMDAwMDwvQjI+CiAgICAgICAgICAgIDxCMz4wLjAwMDAwMDAwPC9CMz4KICAgICAgICAgICAgPEI0PjAuMDAwMDAwMDA8L0I0PgogICAgICAgICAgICA8QjU+MC4wMDAwMDAwMDwvQjU+CiAgICAgICAgPC9Qb2x5bm9tZVBhcmE+CiAgICA8L0Nvb3JkaW5hdGVTeXN0ZW0+CjwvSEVBRD4K")
LAYER_CONFIG = base64.b64decode("PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48TGF5ZXJSb290Pgo8VmVyc2lvbj4KPFZhcj4xLjEuMC4xPC9WYXI+CjwvVmVyc2lvbj4KPC9MYXllclJvb3Q+Cg==")
BASE_CORRECT = base64.b64decode("PD94bWwgdmVyc2lvbj0nMS4wJyBlbmNvZGluZz0nVVRGLTgnID8+CjxIRUFEPgo8QmFzZUNoYW5nZU9wdGlvbj4KPFZlcj4xLjA8L1Zlcj4KPENvcnJlY3RQYXJhbWV0ZXI+CjxETGF0aXR1ZGU+MC4wPC9ETGF0aXR1ZGU+CjxETG9uZ2l0dWRlPjAuMDwvRExvbmdpdHVkZT4KPERBbHRpdHVkZT4wLjA8L0RBbHRpdHVkZT4KPER4PjAuMDwvRHg+CjxEeT4wLjA8L0R5Pgo8RGg+MC4wPC9EaD4KPC9Db3JyZWN0UGFyYW1ldGVyPgo8UmVmcmVzaENvcnJlY3RQYXJhbWV0ZXI+CjxETGF0aXR1ZGU+MC4wPC9ETGF0aXR1ZGU+CjxETG9uZ2l0dWRlPjAuMDwvRExvbmdpdHVkZT4KPERBbHRpdHVkZT4wLjA8L0RBbHRpdHVkZT4KPER4PjAuMDwvRHg+CjxEeT4wLjA8L0R5Pgo8RGg+MC4wPC9EaD4KPC9SZWZyZXNoQ29ycmVjdFBhcmFtZXRlcj4KPENvcnJlY3RDb29yZGluYXRlPgo8T3JpZ2luYWxQb2ludD4KPE5hbWU+MC4wPC9OYW1lPgo8TGF0aXR1ZGU+MC4wPC9MYXRpdHVkZT4KPExvbmdpdHVkZT4wLjA8L0xvbmdpdHVkZT4KPEFsdGl0dWRlPjAuMDwvQWx0aXR1ZGU+CjxOb3J0aD4wLjA8L05vcnRoPgo8RWFzdD4wLjA8L0Vhc3Q+CjxIZWlnaHQ+MC4wPC9IZWlnaHQ+CjxQb2ludFR5cGU+ODwvUG9pbnRUeXBlPgo8Q29vcmRpbmF0ZVR5cGU+MDwvQ29vcmRpbmF0ZVR5cGU+CjxHUFNJRD4wPC9HUFNJRD4KPC9PcmlnaW5hbFBvaW50Pgo8Q3VycmVjdFBvaW50Pgo8TmFtZT4wPC9OYW1lPgo8TGF0aXR1ZGU+MC4wPC9MYXRpdHVkZT4KPExvbmdpdHVkZT4wLjA8L0xvbmdpdHVkZT4KPEFsdGl0dWRlPjAuMDwvQWx0aXR1ZGU+CjxOb3J0aD4wLjA8L05vcnRoPgo8RWFzdD4wLjA8L0Vhc3Q+CjxIZWlnaHQ+MC4wPC9IZWlnaHQ+CjxQb2ludFR5cGU+ODwvUG9pbnRUeXBlPgo8Q29vcmRpbmF0ZVR5cGU+MDwvQ29vcmRpbmF0ZVR5cGU+CjxHUFNJRD4wPC9HUFNJRD4KPC9DdXJyZWN0UG9pbnQ+CjxCYXNlPgo8QmFzZV9JRD4wPC9CYXNlX0lEPgo8QmFzZV9MYXRpdHVkZT4wLjA8L0Jhc2VfTGF0aXR1ZGU+CjxCYXNlX0xvbmdpdHVkZT4wLjA8L0Jhc2VfTG9uZ2l0dWRlPgo8QmFzZV9BbHRpdHVkZT4wLjA8L0Jhc2VfQWx0aXR1ZGU+CjwvQmFzZT4KPC9Db3JyZWN0Q29vcmRpbmF0ZT4KPFJlZnJlc2hDb3JyZWN0Q29vcmRpbmF0ZT4KPFJlZnJlc2hPcmlnaW5hbFBvaW50Pgo8TmFtZT4wLjA8L05hbWU+CjxMYXRpdHVkZT4wLjA8L0xhdGl0dWRlPgo8TG9uZ2l0dWRlPjAuMDwvTG9uZ2l0dWRlPgo8QWx0aXR1ZGU+MC4wPC9BbHRpdHVkZT4KPE5vcnRoPjAuMDwvTm9ydGg+CjxFYXN0PjAuMDwvRWFzdD4KPEhlaWdodD4wLjA8L0hlaWdodD4KPFBvaW50VHlwZT44PC9Qb2ludFR5cGU+CjxDb29yZGluYXRlVHlwZT4wPC9Db29yZGluYXRlVHlwZT4KPEdQU0lEPjA8L0dQU0lEPgo8L1JlZnJlc2hPcmlnaW5hbFBvaW50Pgo8UmVmcmVzaEN1cnJlY3RQb2ludD4KPE5hbWU+MDwvTmFtZT4KPExhdGl0dWRlPjAuMDwvTGF0aXR1ZGU+CjxMb25naXR1ZGU+MC4wPC9Mb25naXR1ZGU+CjxBbHRpdHVkZT4wLjA8L0FsdGl0dWRlPgo8Tm9ydGg+MC4wPC9Ob3J0aD4KPEVhc3Q+MC4wPC9FYXN0Pgo8SGVpZ2h0PjAuMDwvSGVpZ2h0Pgo8UG9pbnRUeXBlPjg8L1BvaW50VHlwZT4KPENvb3JkaW5hdGVUeXBlPjA8L0Nvb3JkaW5hdGVUeXBlPgo8R1BTSUQ+MDwvR1BTSUQ+CjwvUmVmcmVzaEN1cnJlY3RQb2ludD4KPC9SZWZyZXNoQ29ycmVjdENvb3JkaW5hdGU+CjwvQmFzZUNoYW5nZU9wdGlvbj4KPC9IRUFEPgo=")

def safe_name(value, fallback="GeoCAD_Project"):
    value = str(value or "").strip()
    value = re.sub(r'[\\/:*?"<>|]+', '_', value)
    value = re.sub(r'\\s+', '_', value)
    value = re.sub(r'[^A-Za-z0-9._-]', '_', value)
    value = value.strip('._')[:60]
    return value or fallback

def finite_number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except Exception:
        return None

def build_project(project_name, raw_points):
    name = safe_name(project_name)
    points = []
    for i, item in enumerate(raw_points[:5000], 1):
        lat = finite_number(item.get("lat"))
        lng = finite_number(item.get("lng"))
        north = finite_number(item.get("n"))
        east = finite_number(item.get("e"))
        height = finite_number(item.get("h"))
        if None in (lat, lng, north, east):
            continue
        points.append({
            "name": safe_name(item.get("name"), "GEO%d" % i),
            "lat": lat, "lng": lng, "n": north, "e": east,
            "h": 0.0 if height is None else height,
        })
    if not points:
        raise ValueError("Nessun punto valido da esportare")

    now = datetime.datetime.now()
    dt = now.strftime("%Y-%m-%d %H:%M:%S")
    dtms = dt + ".000"

    fd, db_path = tempfile.mkstemp(suffix=".SDA")
    os.close(fd)
    try:
        db = sqlite3.connect(db_path)
        db.execute("PRAGMA auto_vacuum=1")
        db.execute("PRAGMA user_version=16")
        db.executescript(SCHEMA_SQL)
        db.execute("INSERT INTO android_metadata(locale) VALUES(?)", ("it_IT",))
        db.execute("""INSERT INTO CorrectTable
          (knownPointN,knownPointE,knownPointH,wgs84Latitude,wgs84Longitude,wgs84Altitude,
           dx,dy,dh,baseID,baseLatitude,baseLongitude,baseAltitude,correctTime)
          VALUES(0,0,0,0,0,0,0,0,0,'0',0,0,0,?)""", (dtms,))
        for point in points:
            entity = db.execute("""INSERT INTO EntityTable
              (type,name,code,layerName,minNorth,minEast,minHeight,MaxNorth,MaxEast,MaxHeight,
               perimeter,acreage,isDeleted,imageList)
              VALUES(1,?,'',NULL,0,0,0,0,0,0,0,0,0,NULL)""", (point["name"],))
            entity_id = entity.lastrowid
            db.execute("""INSERT INTO PointTable
              (name,code,latitude,longitude,altitude,n,e,h,coordinateType,pointType,isDeleted,
               gpsID,entityID,netConvertType,pdaID,elevMask,startTime,endTime,epochCount,
               targetPointID,stakeoutSurveyPoint,stakeoutTimes,laserDistance,isCross,laserHRMS,
               laserVRMS,codeStyle)
              VALUES(?,'',?,?,?,?,?,?,0,2,0,0,?,0,'',0,?,?,1,NULL,0,0,0.0,0,0.0,0.0,NULL)""",
              (point["name"], point["lat"], point["lng"], point["h"], point["n"], point["e"],
               point["h"], entity_id, dtms, dtms))
        db.commit()
        db.close()
        with open(db_path, "rb") as fh:
            sda = fh.read()
    finally:
        try:
            os.remove(db_path)
        except OSError:
            pass

    avg_n = sum(p["n"] for p in points) / len(points)
    avg_e = sum(p["e"] for p in points) / len(points)

    psf = f"""<?xml version='1.0' encoding='UTF-8' ?>
<Config>
<HEAD>
<Ver>1.0</Ver>
<Name>{name}</Name>
<Remark></Remark>
<CreateDateTime>{dt}</CreateDateTime>
<DxfFileConfig></DxfFileConfig>
</HEAD>
<WorkOption>
<Zone></Zone>
<ArithmeticType></ArithmeticType>
<FileAngleFormat>2</FileAngleFormat>
<StakeoutPlaySound></StakeoutPlaySound>
<ApplyProjectTemplate>1</ApplyProjectTemplate>
<ApplyProjectName>{name}</ApplyProjectName>
<ApplyProjectGisTemplate></ApplyProjectGisTemplate>
<CoordinateSystemEncrypt>0</CoordinateSystemEncrypt>
<ApplyCoordSystemType>0</ApplyCoordSystemType>
<EnterType>-1</EnterType>
<RtcmInputEllipsoid></RtcmInputEllipsoid>
<RtcmInputProjectPar></RtcmInputProjectPar>
<RtcmInputSevenPar></RtcmInputSevenPar>
<RtcmInputFourPar></RtcmInputFourPar>
<RtcmInputHeightFitting></RtcmInputHeightFitting>
<RtcmInputVerticalPar></RtcmInputVerticalPar>
<RtcmInputCorrectPar></RtcmInputCorrectPar>
</WorkOption>
<DataOption>
<DatabaseName>{name}.SDA</DatabaseName>
<PROJECT_ZONE>0</PROJECT_ZONE>
</DataOption>
</Config>
""".encode("utf-8")

    map_xml = f"""<?xml version='1.0' encoding='UTF-8' ?>
<HEAD>
<Ver></Ver>
<Start>
<x>{avg_n:.6f}</x>
<y>{avg_e:.6f}</y>
<h>0.0</h>
</Start>
<Scale>0.053536272640864434</Scale>
<BackGround>-1</BackGround>
</HEAD>
""".encode("utf-8")

    raw = (f"--Project {name}\r\n"
           "--Generated by Phillo GeoCAD\r\n"
           "--No GNSS observations stored\r\n").encode("utf-8")

    rw5 = (f"JB,NM{name},DT{now:%m-%d-%Y},TM{now:%H:%M:%S}\r\n"
           "MO,AD0,UN1,SF1.000000,EC0,EO0.0,AU0\r\n"
           "--Generated by Phillo GeoCAD\r\n"
           "--No GNSS observations: points are planned/imported coordinates\r\n").encode("utf-8")

    base = f"/storage/emulated/0/T Survey 2.0/Project/{name}"
    files = {
        f"{name}.CTP": CTP,
        f"{name}.PSF": psf,
        "CAD/LayerConfig.xml": LAYER_CONFIG,
        f"Data/{name}.SDA": sda,
        f"Data/{name}.raw": raw,
        f"Data/{name}.rw5": rw5,
        "Electric/ElectricLineLibrary.ell": b"",
        "Config/Map.xml": map_xml,
        "Config/BaseCorrectParameter.xml": BASE_CORRECT,
        "Config/ConvertPoint.ini": b"",
        "Gis/Images/.nomedia": (base + "/Gis/Images\n").encode("utf-8"),
        "Gis/Files/.nomedia": (base + "/Gis/Files\n").encode("utf-8"),
    }
    return name, files

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > 2000000:
                raise ValueError("Richiesta non valida")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            name, files = build_project(payload.get("projectName"), payload.get("points") or [])
            mode = parse_qs(urlparse(self.path).query).get("mode", ["zip"])[0]

            if mode == "files":
                body = json.dumps({
                    "projectName": name,
                    "files": [
                        {"path": path, "base64": base64.b64encode(data).decode("ascii")}
                        for path, data in files.items()
                    ]
                }, separators=(",", ":")).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            out = io.BytesIO()
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
                for path, data in files.items():
                    archive.writestr(f"{name}/{path}", data)
            body = out.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Disposition", f'attachment; filename="{name}.zip"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, format, *args):
        return
