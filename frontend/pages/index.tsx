"use client";
import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { usePortfolioData } from "../hooks/usePortfolioData";

interface PortfolioItem {
  stockName: string;
  purchasePrice: number;
  qty: number;
  investment: number;
  portfolioPercent: number;
  exchange: string;
  cmp: number | null;
  presentValue: number | null;
  gainLoss: number | null;
  peRatio: number | null;
  latestEarnings: number | string | null;
  sector: string;
}

// Define the sorting state type
type SortingState = Array<{
  id: string;
  desc: boolean;
}>;

export default function Home() {
  const { data, error, isLoading } = usePortfolioData();
  const isEmpty = !data || data.length === 0;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // ✅ Define table columns with ALL required fields
  const columns = useMemo<ColumnDef<PortfolioItem>[]>(
    () => [
      { 
        accessorKey: "stockName", 
        header: "Particulars (Stock Name)",
        minSize: 180
      },
      {
        accessorKey: "purchasePrice",
        header: "Purchase Price",
        cell: (info) => `₹${info.getValue<number>().toLocaleString()}`,
      },
      { 
        accessorKey: "qty", 
        header: "Quantity (Qty)",
        cell: (info) => info.getValue<number>().toLocaleString()
      },
      {
        accessorKey: "investment",
        header: "Investment",
        cell: (info) => `₹${info.getValue<number>().toLocaleString()}`,
      },
      {
        accessorKey: "portfolioPercent",
        header: "Portfolio (%)",
        cell: (info) => `${info.getValue<number>().toFixed(2)}%`,
      },
      { 
        accessorKey: "exchange", 
        header: "NSE/BSE",
        cell: (info) => info.getValue() || "—"
      },
      {
        accessorKey: "cmp",
        header: "CMP",
        cell: (info) => {
          const value = info.getValue<number>();
          return value ? `₹${value.toLocaleString()}` : "—";
        }
      },
      {
        accessorKey: "presentValue",
        header: "Present Value",
        cell: (info) => {
          const value = info.getValue<number>();
          return value ? `₹${value.toLocaleString()}` : "—";
        }
      },
      {
        accessorKey: "gainLoss",
        header: "Gain/Loss",
        cell: (info) => {
          const value = info.getValue<number>();
          if (value === null || value === undefined) return "—";
          
          return (
            <span style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              backgroundColor: value >= 0 ? '#dcfce7' : '#fee2e2',
              color: value >= 0 ? '#166534' : '#dc2626',
              border: `1px solid ${value >= 0 ? '#bbf7d0' : '#fecaca'}`,
              display: 'inline-block'
            }}>
              {value >= 0 ? "+" : ""}₹{value.toLocaleString()}
            </span>
          );
        },
      },
      {
        accessorKey: "peRatio",
        header: "P/E Ratio",
        cell: (info) => {
          const value = info.getValue<number>();
          return value ? value.toFixed(2) : "—";
        }
      },
      {
        accessorKey: "latestEarnings",
        header: "Latest Earnings",
        cell: (info) => {
          const value = info.getValue();
          if (!value) return "—";
          return typeof value === 'number' ? `₹${value.toLocaleString()}` : value;
        }
      },
      { 
        accessorKey: "sector", 
        header: "Sector",
        cell: (info) => info.getValue() || "Unknown"
      },
    ],
    []
  );

  // ✅ Initialize table (also outside conditionals)
  const table = useReactTable({
    data: data || [],
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // ✅ Conditional rendering AFTER hooks
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {/* Animated loading spinner */}
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        
        {/* Loading text with dots animation */}
        <div style={{
          fontSize: '18px',
          color: '#6b7280',
          fontWeight: '500',
          textAlign: 'center'
        }}>
          <span>Loading your portfolio</span>
          <span style={{
            display: 'inline-block',
            animation: 'dots 1.5s infinite'
          }}>...</span>
        </div>
        
        {/* Fun loading messages that change */}
        <div style={{
          fontSize: '14px',
          color: '#9ca3af',
          textAlign: 'center',
          fontStyle: 'italic',
          maxWidth: '300px'
        }}>
          Fetching your latest stock prices and calculating gains...
        </div>

        {/* Add CSS animations */}
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes dots {
            0%, 20% { opacity: 0; }
            50% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }
  if (error) return <div style={{padding: '40px', textAlign: 'center', fontSize: '18px', color: '#dc2626'}}>Failed to load data</div>;
  if (isEmpty) return <div style={{padding: '40px', textAlign: 'center', fontSize: '18px', color: '#6b7280'}}>No portfolio data available</div>;

  // ✅ Summary calculations (safe because data is available now)
  const totalInvestment = data.reduce(
    (sum: number, stock: PortfolioItem) => sum + stock.investment,
    0
  );
  const totalValue = data.reduce(
    (sum: number, stock: PortfolioItem) => sum + (stock.presentValue || 0),
    0
  );
  const totalGainLoss = totalValue - totalInvestment;

  // ✅ Sector grouping calculations
  const sectorSummary = data.reduce((acc: any, stock: PortfolioItem) => {
    if (!acc[stock.sector]) {
      acc[stock.sector] = {
        totalInvestment: 0,
        totalPresentValue: 0,
        totalGainLoss: 0,
        stockCount: 0
      };
    }
    
    acc[stock.sector].totalInvestment += stock.investment;
    acc[stock.sector].totalPresentValue += stock.presentValue || 0;
    acc[stock.sector].totalGainLoss += stock.gainLoss || 0;
    acc[stock.sector].stockCount += 1;
    
    return acc;
  }, {});

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px'}}>
      <div style={{maxWidth: '1400px', margin: '0 auto'}}>
        
        {/* Header */}
        <div style={{marginBottom: '40px'}}>
          <h1 style={{fontSize: '32px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', margin: '0 0 8px 0'}}>
            Portfolio Dashboard
          </h1>
          <p style={{color: '#6b7280', fontSize: '16px', margin: '0'}}>
            Track your investments, sector allocation, and performance with real-time data.
          </p>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '24px', 
          marginBottom: '40px'
        }}>
          <div style={{
            backgroundColor: 'white', 
            padding: '24px', 
            borderRadius: '12px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{fontSize: '14px', fontWeight: '500', color: '#6b7280', marginBottom: '8px', margin: '0 0 8px 0'}}>
              Total Investment
            </h3>
            <p style={{fontSize: '28px', fontWeight: 'bold', color: '#1f2937', margin: '0'}}>
              ₹{totalInvestment.toLocaleString()}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white', 
            padding: '24px', 
            borderRadius: '12px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{fontSize: '14px', fontWeight: '500', color: '#6b7280', marginBottom: '8px', margin: '0 0 8px 0'}}>
              Present Value
            </h3>
            <p style={{fontSize: '28px', fontWeight: 'bold', color: '#1f2937', margin: '0'}}>
              ₹{totalValue.toLocaleString()}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white', 
            padding: '24px', 
            borderRadius: '12px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{fontSize: '14px', fontWeight: '500', color: '#6b7280', marginBottom: '8px', margin: '0 0 8px 0'}}>
              Net Gain / Loss
            </h3>
            <p style={{
              fontSize: '28px', 
              fontWeight: 'bold', 
              color: totalGainLoss >= 0 ? '#059669' : '#dc2626',
              margin: '0'
            }}>
              {totalGainLoss >= 0 ? "+" : ""}₹{totalGainLoss.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Sector Summary Cards */}
        <div style={{marginBottom: '40px'}}>
          <h2 style={{fontSize: '24px', fontWeight: '600', color: '#1f2937', marginBottom: '20px', margin: '0 0 20px 0'}}>
            Sector-wise Summary
          </h2>
          <div style={{
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
            gap: '16px'
          }}>
            {Object.entries(sectorSummary).map(([sector, summary]: [string, any]) => (
              <div key={sector} style={{
                backgroundColor: 'white', 
                padding: '20px', 
                borderRadius: '8px', 
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
                border: '1px solid #e5e7eb'
              }}>
                <h4 style={{fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '12px', margin: '0 0 12px 0'}}>
                  {sector} ({summary.stockCount} stocks)
                </h4>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between'}}>
                    <span style={{color: '#6b7280', fontSize: '14px'}}>Investment:</span>
                    <span style={{fontWeight: '500'}}>₹{summary.totalInvestment.toLocaleString()}</span>
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between'}}>
                    <span style={{color: '#6b7280', fontSize: '14px'}}>Present Value:</span>
                    <span style={{fontWeight: '500'}}>₹{summary.totalPresentValue.toLocaleString()}</span>
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between'}}>
                    <span style={{color: '#6b7280', fontSize: '14px'}}>Gain/Loss:</span>
                    <span style={{
                      fontWeight: '500',
                      color: summary.totalGainLoss >= 0 ? '#059669' : '#dc2626'
                    }}>
                      {summary.totalGainLoss >= 0 ? "+" : ""}₹{summary.totalGainLoss.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Table */}
        <div style={{
          backgroundColor: 'white', 
          borderRadius: '12px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          
          {/* Table Header */}
          <div style={{padding: '20px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f8fafc'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
              <h2 style={{fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: '0'}}>
                Stock Details ({data.length} stocks)
              </h2>
              <input
                type="text"
                value={globalFilter ?? ""}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search stocks..."
                style={{
                  padding: '8px 12px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '6px', 
                  fontSize: '14px',
                  width: '200px'
                }}
              />
            </div>
          </div>

          {/* Enhanced Table with horizontal scroll */}
          <div style={{overflowX: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', minWidth: '1200px'}}>
              
              {/* Table Header */}
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} style={{backgroundColor: '#f8fafc'}}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{
                          padding: '16px 12px',
                          textAlign: 'left',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#374151',
                          cursor: 'pointer',
                          borderBottom: '2px solid #e5e7eb',
                          borderRight: '1px solid #e5e7eb',
                          minWidth: '100px'
                        }}
                      >
                        <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                          <span>
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          <span style={{color: '#9ca3af', fontSize: '12px'}}>
                            {{asc: "↑", desc: "↓"}[header.column.getIsSorted() as string] ?? "↕"}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>

              {/* Table Body */}
              <tbody>
                {table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    style={{
                      backgroundColor: index % 2 === 0 ? 'white' : '#fafbfc',
                      borderBottom: '1px solid #f1f5f9'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#fafbfc'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '16px 12px',
                          fontSize: '13px',
                          color: '#1f2937',
                          borderRight: '1px solid #f1f5f9'
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Summary */}
          <div style={{
            padding: '16px 24px', 
            borderTop: '2px solid #e5e7eb', 
            backgroundColor: '#f8fafc',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>Total Portfolio: {data.length} stocks across {Object.keys(sectorSummary).length} sectors</span>
              <span>Last updated: {new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}