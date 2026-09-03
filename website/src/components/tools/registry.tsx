import {
  Calculator,
  File,
  FilePen,
  FilePlus,
  FileSearch,
  FileText,
  FolderTree,
  Globe,
  LayoutGrid,
  Network,
  Search,
  ShoppingBasket,
  ShoppingCart,
  SquarePen,
  Tag,
  Trash2,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

export type ToolIcon = ComponentType<{ size?: number; className?: string }>;



function brandIcon(src: string, name: string): ToolIcon {
  return function BrandIcon({ size = 13, className }) {
    return (
      
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
        }}
      />
    );
  };
}




export interface ToolFamily {
  id: string;
  
  label: string;
  Icon: ToolIcon;
}

export const SUPERMARKETS: ToolFamily = {
  id: "supermarkets",
  label: "Checked supermarket catalogues",
  Icon: ShoppingCart,
};






export interface ShopBrandInfo {
  id: string;
  name: string;
  host: string;
  accent: string;
  Icon: ToolIcon;
}

const YEREVAN_CITY: ShopBrandInfo = {
  id: "yerevan-city",
  name: "Yerevan City",
  host: "yerevan-city.am",
  accent: "#ab020e",
  Icon: brandIcon("/sources/yerevan-city.png", "Yerevan City"),
};

const PARMA: ShopBrandInfo = {
  id: "parma",
  name: "Parma",
  host: "parma.am",
  accent: "#1e6c57",
  Icon: brandIcon("/sources/parma.png", "Parma"),
};

const SAS: ShopBrandInfo = {
  id: "sas",
  name: "SAS",
  host: "sas.am",
  accent: "#005cab",
  Icon: brandIcon("/sources/sas.png", "SAS"),
};

export interface ToolPresentation {
  Icon: ToolIcon;
  

  ChildIcon: ToolIcon;
  
  label: string;
  
  groupLabel: string;
  
  verb: string;
  
  family?: ToolFamily;
  


  brand?: ShopBrandInfo;
}








const STACK_TILTS = [-8, 6, -3];

export function BrandStack({
  brands,
  size = 13,
}: {
  brands: ShopBrandInfo[];
  size?: number;
}) {
  const shown = brands.slice(0, 3);
  if (!shown.length) return null;

  
  
  
  const single = shown.length === 1;
  const step = Math.round(size * 0.44);

  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size + step * (shown.length - 1), height: size }}
      aria-hidden
    >
      {shown.map((brand, i) => {
        const Mark = brand.Icon;
        return (
          <span
            key={brand.id}
            className="absolute top-0 origin-center"
            style={{
              left: i * step,
              
              zIndex: shown.length - i,
              ...(single ? {} : { transform: `rotate(${STACK_TILTS[i]}deg)` }),
            }}
          >
            
            <Mark
              size={size}
              className={single ? undefined : "ring-[1.5px] ring-bg"}
            />
          </span>
        );
      })}
    </span>
  );
}


export function brandsOf(toolNames: string[]): ShopBrandInfo[] {
  const seen = new Map<string, ShopBrandInfo>();
  for (const name of toolNames) {
    const brand = presentTool(name).brand;
    if (brand && !seen.has(brand.id)) seen.set(brand.id, brand);
  }
  return [...seen.values()];
}



function shopTools(
  prefix: string,
  brand: ShopBrandInfo,
): Record<string, ToolPresentation> {
  const common = { family: SUPERMARKETS, brand, Icon: brand.Icon };
  return {
    [`${prefix}_search`]: {
      ...common,
      ChildIcon: ShoppingBasket,
      label: `Search ${brand.name} products`,
      groupLabel: `Searched ${brand.name}`,
      verb: `Searched ${brand.name}`,
    },
    [`${prefix}_product`]: {
      ...common,
      ChildIcon: Tag,
      label: `View ${brand.name} product details`,
      groupLabel: `Looked up products at ${brand.name}`,
      verb: "Looked up a product",
    },
    [`${prefix}_categories`]: {
      ...common,
      ChildIcon: LayoutGrid,
      label: `Browse ${brand.name} categories`,
      groupLabel: `Browsed ${brand.name} categories`,
      verb: "Browsed categories",
    },
  };
}

const REGISTRY: Record<string, ToolPresentation> = {
  ...shopTools("yerevan_city", YEREVAN_CITY),
  ...shopTools("parma", PARMA),
  ...shopTools("sas", SAS),

  web_search: {
    Icon: Search,
    ChildIcon: Globe,
    label: "Search the web",
    groupLabel: "Searched the web",
    verb: "Searched the web",
  },
  web_extract: {
    Icon: FileText,
    ChildIcon: Globe,
    label: "Read web pages",
    groupLabel: "Read pages",
    verb: "Read a page",
  },
  web_crawl: {
    Icon: Network,
    ChildIcon: Globe,
    label: "Crawl a site",
    groupLabel: "Crawled a site",
    verb: "Crawled a site",
  },
  web_map: {
    Icon: Globe,
    ChildIcon: Globe,
    label: "Map a site",
    groupLabel: "Mapped a site",
    verb: "Mapped a site",
  },
  calculator: {
    Icon: Calculator,
    ChildIcon: Calculator,
    label: "Calculate",
    groupLabel: "Calculated",
    verb: "Calculated",
  },
  fs_list: {
    Icon: FolderTree,
    ChildIcon: FolderTree,
    label: "List the workspace",
    groupLabel: "Listed the workspace",
    verb: "Listed the workspace",
  },
  fs_read: {
    Icon: File,
    ChildIcon: File,
    label: "Read files",
    groupLabel: "Read files",
    verb: "Read a file",
  },
  fs_write: {
    Icon: FilePlus,
    ChildIcon: FilePlus,
    label: "Write files",
    groupLabel: "Wrote files",
    verb: "Wrote a file",
  },
  fs_edit: {
    Icon: SquarePen,
    ChildIcon: FilePen,
    label: "Edit files",
    groupLabel: "Edited files",
    verb: "Edited a file",
  },
  fs_delete: {
    Icon: Trash2,
    ChildIcon: Trash2,
    label: "Delete files",
    groupLabel: "Deleted files",
    verb: "Deleted a file",
  },
  fs_rename: {
    Icon: FilePen,
    ChildIcon: FilePen,
    label: "Rename files",
    groupLabel: "Renamed files",
    verb: "Renamed a file",
  },
  fs_search: {
    Icon: FileSearch,
    ChildIcon: FileSearch,
    label: "Search the workspace",
    groupLabel: "Searched the workspace",
    verb: "Searched the workspace",
  },
};

const FALLBACK: ToolPresentation = {
  Icon: Wrench,
  ChildIcon: Wrench,
  label: "Use a tool",
  groupLabel: "Used tools",
  verb: "Used a tool",
};

export function presentTool(name: string): ToolPresentation {
  return REGISTRY[name] ?? FALLBACK;
}



export function runKey(name: string): string {
  return presentTool(name).family?.id ?? name;
}
