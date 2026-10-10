const WFS='https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';

export default async function handler(req,res){
  const mode=String(req.query.mode||'resourceid');
  const params=new URLSearchParams({
    language:'ita',
    SERVICE:'WFS',
    VERSION:'2.0.0',
    REQUEST:'GetFeature',
    TYPENAMES:'CP:CadastralParcel',
    SRSNAME:'urn:ogc:def:crs:EPSG::6706',
    COUNT:'10'
  });
  if(mode==='resourceid'){
    params.set('RESOURCEID',String(req.query.id||'CadastralParcel.IT.AGE.PLA.A176_003100.329'));
  }else{
    params.set('BBOX',String(req.query.bbox||'37.9999995,12.9999995,38.0000005,13.0000005'));
  }
  const url=WFS+'?'+params.toString();
  try{
    const r=await fetch(url,{headers:{'User-Agent':'Phillo-GeoCAD-Test/1.0','Accept':'application/xml,text/xml,*/*'}});
    const text=await r.text();
    res.status(r.status).json({status:r.status,contentType:r.headers.get('content-type'),url,body:text.slice(0,12000)});
  }catch(e){
    res.status(500).json({error:String(e&&e.message||e),url});
  }
}
