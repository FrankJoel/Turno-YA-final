import os

def exportar_codigo_a_txt(ruta_proyecto, archivo_salida="codigo_completo.txt"):
    # Extensiones de código comunes que queremos leer
    extensiones_validas = ('.py', '.js', '.ts', '.html', '.css', '.cpp', '.c', '.h', '.java', '.cs', '.pyw')
    
    with open(archivo_salida, "w", encoding="utf-8") as txt_out:
        txt_out.write("=====================================================\n")
        txt_out.write(f"EXPORTACIÓN DE CÓDIGO - PROYECTO: {os.path.basename(ruta_proyecto)}\n")
        txt_out.write("=====================================================\n\n")
        
        for raiz, directorios, archivos in os.walk(ruta_proyecto):
            # Ignorar carpetas pesadas o de configuración
            if any(ignorar in raiz for ignorar in ['node_modules', '.git', '__pycache__', '.vscode', 'venv', '.venv']):
                continue
                
            for archivo in archivos:
                if archivo.endswith(extensiones_validas):
                    ruta_completa = os.path.join(raiz, archivo)
                    ruta_relativa = os.path.relpath(ruta_completa, ruta_proyecto)
                    
                    # Evitar que el script se lea a sí mismo
                    if archivo == "exportador_codigo.py" or archivo == archivo_salida:
                        continue
                        
                    txt_out.write(f"\n// =====================================================\n")
                    txt_out.write(f"// ARCHIVO: {ruta_relativa}\n")
                    txt_out.write(f"// =====================================================\n\n")
                    
                    try:
                        with open(ruta_completa, "r", encoding="utf-8") as f_in:
                            txt_out.write(f_in.read())
                    except Exception as e:
                        txt_out.write(f"[ERROR AL LEER EL ARCHIVO: {str(e)}]\n")
                    txt_out.write("\n\n")
                    
    print(f"¡Éxito! Todo el código ha sido exportado a {archivo_salida}")

# AQUÍ ES DONDE SE SELECCIONA LA CARPETA ACTUAL
exportar_codigo_a_txt('.')