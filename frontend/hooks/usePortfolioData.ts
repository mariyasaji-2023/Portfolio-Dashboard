import useSWR from "swr";
import axios from "axios";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export function usePortfolioData() {
  const { data, error, isLoading } = useSWR(
  "https://portfolio-dashboard-gmfd.onrender.com/api/portfolio",
  fetcher,
  { refreshInterval: 15000 }
);
  return { data, error, isLoading };
}
