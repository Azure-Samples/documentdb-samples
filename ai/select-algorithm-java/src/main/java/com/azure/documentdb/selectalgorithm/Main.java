package com.azure.documentdb.selectalgorithm;

public class Main {

    public static void main(String[] args) {
        String algorithm = Utils.getEnv("ALGORITHM", "all").toLowerCase().trim();

        System.out.println("==============================================");
        System.out.println("  Azure DocumentDB - Vector Search Algorithms");
        System.out.println("==============================================");
        System.out.println("  Algorithm: " + algorithm);
        System.out.println();

        switch (algorithm) {
            case "ivf" -> IvfDemo.run();
            case "hnsw" -> HnswDemo.run();
            case "diskann" -> DiskannDemo.run();
            case "compare" -> CompareAll.run();
            case "all" -> {
                IvfDemo.run();
                HnswDemo.run();
                DiskannDemo.run();
            }
            default -> {
                System.err.println("Unknown algorithm: " + algorithm);
                System.err.println("Valid options: ivf, hnsw, diskann, compare, all");
                System.exit(1);
            }
        }

        System.out.println("==============================================");
        System.out.println("  All demos complete.");
        System.out.println("==============================================");
    }
}
