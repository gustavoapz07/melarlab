// Tipos de las tablas de Supabase. Archivo generado: no editar a mano.
// Se vuelve a generar después de cada migración (conector de Supabase: generate_typescript_types,
// o `npx supabase gen types typescript --project-id <id>`).
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      avisos_push: {
        Row: {
          auth: string
          creado: string
          endpoint: string
          id: string
          p256dh: string
          ultimo_aviso: string | null
          usuario_id: string
        }
        Insert: {
          auth: string
          creado?: string
          endpoint: string
          id?: string
          p256dh: string
          ultimo_aviso?: string | null
          usuario_id?: string
        }
        Update: {
          auth?: string
          creado?: string
          endpoint?: string
          id?: string
          p256dh?: string
          ultimo_aviso?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      billetera: {
        Row: {
          actualizado: string
          categoria: string
          creado: string
          descripcion: string | null
          fecha: string
          id: string
          moneda: string
          monto: number
          tipo: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          categoria: string
          creado?: string
          descripcion?: string | null
          fecha: string
          id?: string
          moneda?: string
          monto: number
          tipo: string
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          categoria?: string
          creado?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          moneda?: string
          monto?: number
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          actualizado: string
          contacto: string | null
          creado: string
          estado: string
          id: string
          negocio: string
          notas: string | null
          proximo_seguimiento: string | null
          rubro: string | null
          ultimo_contacto: string | null
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          contacto?: string | null
          creado?: string
          estado?: string
          id?: string
          negocio: string
          notas?: string | null
          proximo_seguimiento?: string | null
          rubro?: string | null
          ultimo_contacto?: string | null
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          contacto?: string | null
          creado?: string
          estado?: string
          id?: string
          negocio?: string
          notas?: string | null
          proximo_seguimiento?: string | null
          rubro?: string | null
          ultimo_contacto?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      comidas: {
        Row: {
          actualizado: string
          casera: boolean
          comida: string
          creado: string
          fecha: string
          id: string
          momento: string
          notas: string | null
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          casera?: boolean
          comida: string
          creado?: string
          fecha: string
          id?: string
          momento: string
          notas?: string | null
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          casera?: boolean
          comida?: string
          creado?: string
          fecha?: string
          id?: string
          momento?: string
          notas?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      contenido: {
        Row: {
          actualizado: string
          creado: string
          enlace: string | null
          estado: string
          fecha_publicacion: string | null
          formato: string | null
          id: string
          idea: string
          redes: string[]
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          creado?: string
          enlace?: string | null
          estado?: string
          fecha_publicacion?: string | null
          formato?: string | null
          id?: string
          idea: string
          redes?: string[]
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          creado?: string
          enlace?: string | null
          estado?: string
          fecha_publicacion?: string | null
          formato?: string | null
          id?: string
          idea?: string
          redes?: string[]
          usuario_id?: string
        }
        Relationships: []
      }
      descanso: {
        Row: {
          actualizado: string
          calidad: number | null
          creado: string
          fecha: string
          horas_dormidas: number | null
          id: string
          me_desperte: string
          me_dormi: string
          notas: string | null
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          calidad?: number | null
          creado?: string
          fecha: string
          horas_dormidas?: number | null
          id?: string
          me_desperte: string
          me_dormi: string
          notas?: string | null
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          calidad?: number | null
          creado?: string
          fecha?: string
          horas_dormidas?: number | null
          id?: string
          me_desperte?: string
          me_dormi?: string
          notas?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      estudios: {
        Row: {
          actualizado: string
          asignatura: string
          codigo: string
          creado: string
          creditos: number
          estado: string
          id: string
          nota_final: number | null
          notas: string | null
          periodo: number
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          asignatura: string
          codigo: string
          creado?: string
          creditos?: number
          estado?: string
          id?: string
          nota_final?: number | null
          notas?: string | null
          periodo: number
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          asignatura?: string
          codigo?: string
          creado?: string
          creditos?: number
          estado?: string
          id?: string
          nota_final?: number | null
          notas?: string | null
          periodo?: number
          usuario_id?: string
        }
        Relationships: []
      }
      gym: {
        Row: {
          actualizado: string
          creado: string
          duracion_min: number | null
          fecha: string
          id: string
          notas: string | null
          rutina: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          creado?: string
          duracion_min?: number | null
          fecha: string
          id?: string
          notas?: string | null
          rutina: string
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          creado?: string
          duracion_min?: number | null
          fecha?: string
          id?: string
          notas?: string | null
          rutina?: string
          usuario_id?: string
        }
        Relationships: []
      }
      gym_plan: {
        Row: {
          actualizado: string
          creado: string
          dia: number
          id: string
          rutina: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          creado?: string
          dia: number
          id?: string
          rutina: string
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          creado?: string
          dia?: number
          id?: string
          rutina?: string
          usuario_id?: string
        }
        Relationships: []
      }
      lista_deseos: {
        Row: {
          actualizado: string
          creado: string
          enlace: string | null
          estado: string
          id: string
          moneda: string
          notas: string | null
          precio: number | null
          precio_objetivo: number | null
          prioridad: string
          producto: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          creado?: string
          enlace?: string | null
          estado?: string
          id?: string
          moneda?: string
          notas?: string | null
          precio?: number | null
          precio_objetivo?: number | null
          prioridad?: string
          producto: string
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          creado?: string
          enlace?: string | null
          estado?: string
          id?: string
          moneda?: string
          notas?: string | null
          precio?: number | null
          precio_objetivo?: number | null
          prioridad?: string
          producto?: string
          usuario_id?: string
        }
        Relationships: []
      }
      mi_dia: {
        Row: {
          actualizado: string
          creado: string
          datos: Json
          fecha: string
          id: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          creado?: string
          datos: Json
          fecha: string
          id?: string
          usuario_id: string
        }
        Update: {
          actualizado?: string
          creado?: string
          datos?: Json
          fecha?: string
          id?: string
          usuario_id?: string
        }
        Relationships: []
      }
      pendientes: {
        Row: {
          actualizado: string
          area: string
          creado: string
          estado: string
          fecha_limite: string | null
          id: string
          notas: string | null
          prioridad: string
          tarea: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          area?: string
          creado?: string
          estado?: string
          fecha_limite?: string | null
          id?: string
          notas?: string | null
          prioridad?: string
          tarea: string
          usuario_id?: string
        }
        Update: {
          actualizado?: string
          area?: string
          creado?: string
          estado?: string
          fecha_limite?: string | null
          id?: string
          notas?: string | null
          prioridad?: string
          tarea?: string
          usuario_id?: string
        }
        Relationships: []
      }
      radar: {
        Row: {
          actualizado: string
          creado: string
          datos: Json
          fecha: string
          id: string
          usuario_id: string
        }
        Insert: {
          actualizado?: string
          creado?: string
          datos: Json
          fecha: string
          id?: string
          usuario_id: string
        }
        Update: {
          actualizado?: string
          creado?: string
          datos?: Json
          fecha?: string
          id?: string
          usuario_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      avisos_enviados: {
        Args: { enviados: string[]; secreto: string; vencidos: string[] }
        Returns: number
      }
      avisos_por_enviar: {
        Args: { secreto: string; ultimo_intento?: boolean }
        Returns: Json
      }
      guardar_llaves_avisos: {
        Args: { privada: string; publica: string; secreto: string }
        Returns: boolean
      }
      llave_avisos: { Args: never; Returns: string }
      publicar_mi_dia: { Args: { datos: Json }; Returns: string }
      publicar_radar: { Args: { datos: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
