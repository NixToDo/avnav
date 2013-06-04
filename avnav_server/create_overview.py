#!/usr/bin/env python
# -*- coding: utf-8 -*-
# vim: ts=2 sw=2 et ai


###############################################################################
# Copyright (c) 2012,2013 Andreas Vogel andreas@wellenvogel.net
#  parts of this software are based on tiler_tools (...)
#  the license terms (see below) apply to the complete software the same way
#
###############################################################################
# Copyright (c) 2011, Vadim Shlyakhov
#
#  Permission is hereby granted, free of charge, to any person obtaining a
#  copy of this software and associated documentation files (the "Software"),
#  to deal in the Software without restriction, including without limitation
#  the rights to use, copy, modify, merge, publish, distribute, sublicense,
#  and/or sell copies of the Software, and to permit persons to whom the
#  Software is furnished to do so, subject to the following conditions:
#
#  The above copyright notice and this permission notice shall be included
#  in all copies or substantial portions of the Software.
#
#  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
#  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
#  THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
#  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
#  DEALINGS IN THE SOFTWARE.
###############################################################################
import os
import sys
import xml.sax as sax
from optparse import OptionParser
import math
import traceback

info="""
parse a directory hierarchy created with mobac (output OSMTracker) and the associated mobac profile.
and create an avnav.xml file
The directory structure must be z/x/y.png. Tiles must be 256x256 (no check)
Tile numbering is expected to be y=0 upper left.
When reading the profile we try to map each of the "layers" found inside to one of our layers.
This requires to be carefull when creating them, to always use the same min/max zoom for a group of them
as we will directly move them into one of our layers.
"""

OVERVIEW="avnav.xml"
#an xml description of the layers we generated - following the TMS spec
overview_xml='''<?xml version="1.0" encoding="UTF-8" ?>
 <TileMapService version="1.0.0" >
   <Title>avnav tile map service</Title>
   <TileMaps>
   %(tilemaps)s
   </TileMaps>
 </TileMapService>
 '''
overview_tilemap_xml='''
    <TileMap 
       title="%(title)s" 
       srs="OSGEO:41001" 
       profile="%(profile)s" 
       href="%(url)s" 
       minzoom="%(minZoom)d"
       maxzoom="%(maxZoom)d">
       %(bounding)s
       <TileFormat width="256" height="256" mime-type="x-png" extension="png" />
       %(layerboundings)s
    </TileMap>
       
'''


boundingbox_xml='''
<BoundingBox minlon="%(minlon).11G" minlat="%(minlat).11G" maxlon="%(maxlon).11G" maxlat="%(maxlat).11G"
   title="%(title)s"/>
'''
boundings_xml='''
<LayerBoundings>
%(boundings)s
</LayerBoundings>
'''

options=None

def log(s):
  print "LOG: %s"%(s,)

def debug(num,txt):
  if (num <= options.verbose):
    print "DEBUG %s"%(txt,)
    
#convert tile numbers to lat/lon
#see:http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#X_and_Y
#This returns the NW-corner of the square
def num2deg(xtile, ytile, zoom):
  n = 2.0 ** zoom
  lon_deg = xtile / n * 360.0 - 180.0
  lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
  lat_deg = math.degrees(lat_rad)
  return (lat_deg, lon_deg)

class Tileset():
  def __init__(self,name,zoom,minx,miny,maxx,maxy):
    self.name=name
    self.zoom=zoom
    self.minx=minx
    self.miny=miny
    self.maxx=maxx
    self.maxy=maxy
  def getBoundings(self):
    #minx/miny: upper left corner - minlon,maxlat
    #maxx/maxy: lower right       - maxlon,minlat
    maxlat,minlon=num2deg(self.minx,self.miny,self.zoom)
    #try to avoid alway including the next tiles by subtracting 1/1000...
    minlat,maxlon=num2deg(self.maxx+0.999,self.maxy+0.999,self.zoom)
    return {'minlon':minlon,
            'minlat':minlat,
            'maxlon':maxlon,
            'maxlat':maxlat,
            'title':self.name}

class Tilegroup():
  def __init__(self,name):
    self.elements=[]
    self.name=name
    self.minzoom=-1
    self.maxzoom=0
    
  #boundings is zoom,name,minx,miny,maxx,maxy (tilenumbers)
  def addElement(self,element):
    if self.minzoom == -1 or element.zoom < self.minzoom:
      self.minzoom=element.zoom
    if element.zoom > self.maxzoom:
      self.maxzoom=element.zoom
    self.elements.append(element)
  def getMaxZoomElements(self):
    rt=[]
    for el in self.elements:
      if el.zoom==self.maxzoom:
        rt.append(el)
    return rt
      

class Layer():
  def __init__(self,name,minzoom,maxzoom):
    self.tlist=[]
    self.minzoom=minzoom
    self.maxzoom=maxzoom
    self.name=name
  #add ad group if their minzoom/maxzoom fits
  #return true/false  
  def addEntry(self,tilegroup):
    if tilegroup.minzoom != self.minzoom:
      return False
    if tilegroup.maxzoom != self.maxzoom:
      return False
    self.tlist.append(tilegroup)
    return True
  def getMaxZoomElements(self):
    rt=[]
    for tg in self.tlist:
      rt+=tg.getMaxZoomElements()
    return rt
  #return a pseudo tileset to the complete layer
  def getBoundingElement(self):
    mz=self.getMaxZoomElements()
    minx=-1
    miny=-1
    maxx=0
    maxy=0
    for el in mz:
      if miny==-1 or el.miny < miny:
        miny=el.miny
      if minx==-1 or el.minx < minx:
        minx=el.minx
      if el.maxx > maxx:
        maxx=el.maxx
      if el.maxy > maxy:
        maxy=el.maxy
    nel=Tileset("layer",self.maxzoom,minx,miny,maxx,maxy)
    return nel
    

#----------------------------
#sax reader for overview
class ListHandler(sax.handler.ContentHandler): 
  def __init__(self,layerlist): 
    self.eltype=None
    self.layerlist=layerlist
    self.currentGroup=None
    self.startFound=False
  def startElement(self, name, attrs): 
    self.eltype=name
    if name=="atlas":
      self.startFound=True
      return
    if not self.startFound:
      return
    if name == "Layer": 
      self.currentGroup=Tilegroup(attrs['name'])
    elif name == "Map":
      assert self.currentGroup is not None, "invalid xml, missing Layer before Map"
      maxtile = attrs["maxTileCoordinate"]
      mintile = attrs["minTileCoordinate"]
      zoom = int(attrs["zoom"])
      maxta=maxtile.split('/')
      minta=mintile.split('/')
      assert len(maxta) == 2, "invalid format for maxTile %s"%(maxtile,)
      assert len(minta) == 2, "invalid format for minTile %s"%(mintile,)
      maxx=int(maxta[0])/256
      maxy=int(maxta[1])/256
      minx=int(minta[0])/256
      miny=int(minta[1])/256
      self.currentGroup.addElement(Tileset(attrs['name'], zoom, minx, miny, maxx, maxy))
  def endElement(self, name):
    if name == "Layer":
      #try to insert layer into list 
      rt=False
      for layer in self.layerlist:
        rt=layer.addEntry(self.currentGroup)
        if rt:
          log("added entry %s to layer %s"%(self.currentGroup.name,layer.name))
          break
      if not rt:
        name="Layer-%d:%d"%(self.currentGroup.minzoom,self.currentGroup.maxzoom)
        log("creating new layer %s for group %s (%d:%d)"%(name,self.currentGroup.name,self.currentGroup.minzoom,self.currentGroup.maxzoom))
        self.layerlist.append(Layer(name,self.currentGroup.minzoom,self.currentGroup.maxzoom))
        self.layerlist[-1].addEntry(self.currentGroup)
      self.currentGroup=None
  def characters(self, content): 
    pass
  


def createBoundingsXml(tileset):
  return boundingbox_xml % tileset.getBoundings()
  

def writeOverview(overviewfname,layerlist):
  tilemaps=""
  for layer in layerlist:
    boundings=""
    for ce in layer.getMaxZoomElements():
      boundings+=createBoundingsXml(ce)
    boundstr=boundings_xml % {"boundings": boundings}
    tilemaps+=overview_tilemap_xml % {
              "profile": "zxy-mercator",
              "title":layer.name,
              "url":'',
              "minZoom":layer.minzoom,
              "maxZoom":layer.maxzoom,
              "bounding":createBoundingsXml(layer.getBoundingElement()),
              "layerboundings":boundstr,
              }
  overviewstr=overview_xml % {
              "tilemaps":tilemaps,
                              }
  with open(overviewfname,"w") as f:
    f.write(overviewstr)
  log(overviewfname+" written, successfully finished")

def parseAndWrite(xmlfile,ovfile):
  log("parsing xml file %s"%(xmlfile,))
  layerlist=[]
  parser=sax.parse(xmlfile,ListHandler(layerlist))
  if len(layerlist) > 0:
    log("created %d layers from %s"%(len(layerlist),xmlfile))
    layerlist.sort(key=lambda x: x.maxzoom,reverse=True)
    try:
      writeOverview(ovfile,layerlist)
      return True
    except:
      log("error while creating %s:%s"%(ovfile,traceback.format_exc()))
  else:
    log("xml file %s did not contain any layers"%(xmlfile,))
  return False
 
def main(argv):  
  global options, layerlist
  usage="usage: %prog <options> basedir [mobacprofile]"
  parser = OptionParser(
        usage = usage,
        version="1.0",
        description='create overview for avnav')
  parser.add_option("-d", "--debug", dest="verbose")
  parser.add_option("-i", "--ignore", dest="ignore", action="store_const",const=1) 
  (options, args) = parser.parse_args(argv[1:])
  if options.verbose is None:
    options.verbose=0
  else:
    options.verbose=int(options.verbose)
  assert len(args) >=1 ,usage
  filename=None
  outdir=args[0]
  ovfile=os.path.join(outdir,OVERVIEW)
  if len(args) < 2:
    #check for xml files in the outdir being newer as avnav.xml
    assert os.path.isdir(outdir), "output directory %s does not exist"%(outdir,)
    avnavTs=None
    if os.path.isfile(ovfile):
      avnavTs=os.stat(ovfile).st_mtime
    odfiles=os.listdir(outdir)
    foundFile=False
    for ofile in odfiles:
      if ofile == OVERVIEW:
          continue
      if ofile.lower().endswith(".xml"):
        xmlfile=os.path.join(outdir,ofile)
        xmlTs=os.stat(xmlfile).st_mtime
        if avnavTs is None or xmlTs > avnavTs:
          foundFile=True
          rt=parseAndWrite(xmlfile, ovfile)
          if rt:
            return 0
    if foundFile or not options.ignore:
      log("ERROR: did not find any suitable mobac profile in %s"%(outdir,))
      return 1
    else:
      log("did not find any file to update %s"%(ovfile))
      return 2
  else:
    #filename given on commandline
    rt=parseAndWrite(args[1], ovfile)
    if rt:
      return 0
    else:
      return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
