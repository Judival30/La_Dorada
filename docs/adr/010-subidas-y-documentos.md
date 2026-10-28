# ADR-010: Subidas y lectura de documentos de verificación

- Estado: Aceptada
- Fecha: 2026-10-27

## Contexto

En M2 los solicitantes suben documentos sensibles (cédula, Cámara de Comercio, RUT, poder) que el Back Office debe poder revisar. Los archivos son entrada no confiable y no deben quedar accesibles a terceros ni ejecutarse en el navegador.

## Decisión

- **Tipo por contenido:** el tipo de archivo se determina leyendo los primeros bytes (magic bytes), no por la extensión ni por el `Content-Type` que declara el cliente. Solo se aceptan los formatos permitidos: PDF, JPEG y PNG.
- **Tope de 10 MB** por archivo, validado en el servidor.
- **Claves S3 aleatorias:** el objeto se guarda con una clave generada, no derivada del nombre original, impredecible y sin datos del usuario. El nombre original se conserva saneado solo como metadato.
- **Lecturas con URL prefirmada de 60 s:** el bucket es privado. Para leer un documento se emite una URL prefirmada que vence a los 60 segundos, con `Content-Type` y `Content-Disposition` forzados (`ResponseContentType`, `ResponseContentDisposition`), de modo que el navegador no interprete el contenido como HTML.
- **404 para documentos ajenos:** si el documento pertenece a otra persona, el endpoint responde 404 (no 403) para no revelar que existe. Solo lo leen su dueño y el Back Office.

## Consecuencias

- Un archivo con extensión falsa se rechaza aunque el cliente declare un tipo válido.
- Las URLs filtradas dejan de servir en un minuto.
- Los errores son menos explícitos para quien pide un documento ajeno.
- El tope y los formatos son constantes del servicio: cambiarlos exige actualizar este ADR.
