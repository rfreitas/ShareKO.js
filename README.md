ShareKO.js
==========

The Glue between Share.js documents and Knockout.js 2.+ models

Not ready for production, but do hack it.

RoadMap:

1. Model Cyclic Graph support (not sure if it can be done easily and non redundantly, since a Share.js document is a tree aka acyclyc Graph )
2. Define better first time syncing strategies
3. Define a strategy to deal with dynamically created properties (eg. defining properties after object construction). This might be not possible, since there is no aparent KVO capability for non defined properties. 
