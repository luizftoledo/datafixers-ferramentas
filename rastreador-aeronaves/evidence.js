export async function createEvidenceZip(JSZip, raws, ownerFiles, csv, manifest) {
  const zip = new JSZip();
  for (const r of raws) zip.file(`brutos/${r.source}_${r.day}_${r.hex}.json${r.gzip ? '.gz' : ''}`, r.bytes);
  for (const f of ownerFiles) zip.file(`rab/${f.file}`, f.bytes);
  zip.file('voos.csv', csv);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('LEIA-ME.txt', 'Pacote de evidência — Rastreador de aeronaves\n\nOs arquivos em brutos/ são os bytes recebidos pelo navegador. Os arquivos em rab/ são o extrato e os metadados. Confira cada SHA-256 com shasum -a 256 <arquivo> e compare com manifest.json. Os arquivos históricos são UTC. Os voos e aeroportos são reconstruções sujeitas a lacunas de cobertura. OBSERVADO exige ponto próximo à pista; INFERIDO não comprova origem ou destino. A identificação da aeronave não identifica ocupantes.\n');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
